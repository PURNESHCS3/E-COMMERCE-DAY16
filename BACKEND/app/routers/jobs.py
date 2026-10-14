import csv
import io
import json
import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import BACKEND_DIR, get_db
from app.dependencies import get_admin_user, get_current_user
from app.models import BackgroundJob, Order, User
from app.tasks import generate_invoice, import_products_csv


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["Background jobs"])
IMPORT_DIR = BACKEND_DIR / "app" / "uploads" / "imports"
MAX_CSV_BYTES = 10 * 1024 * 1024
REQUIRED_CSV_COLUMNS = {"name", "price", "stock"}


class BackgroundJobResponse(BaseModel):
    id: str
    kind: str
    status: str
    progress: int
    message: str
    result: dict | None = None
    error: str | None = None
    created_at: str | None = None


def _job_response(job: BackgroundJob) -> BackgroundJobResponse:
    return BackgroundJobResponse(
        id=job.id,
        kind=job.kind,
        status=job.status,
        progress=job.progress,
        message=job.message,
        result=json.loads(job.result) if job.result else None,
        error=job.error,
        created_at=job.created_at.isoformat() if job.created_at else None,
    )


@router.get("/", response_model=list[BackgroundJobResponse])
def list_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(BackgroundJob)
    if current_user.role != "admin":
        query = query.filter(BackgroundJob.owner_id == current_user.id)
    return [
        _job_response(job)
        for job in query.order_by(BackgroundJob.created_at.desc()).limit(50).all()
    ]


@router.get("/{job_id}", response_model=BackgroundJobResponse)
def get_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        normalized_id = str(uuid.UUID(job_id))
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Background job not found") from error

    query = db.query(BackgroundJob).filter(BackgroundJob.id == normalized_id)
    if current_user.role != "admin":
        query = query.filter(BackgroundJob.owner_id == current_user.id)
    job = query.first()
    if job is None:
        raise HTTPException(status_code=404, detail="Background job not found")
    return _job_response(job)


@router.post(
    "/invoices/{order_id}",
    response_model=BackgroundJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_invoice_job(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order_query = db.query(Order).filter(Order.id == order_id)
    if current_user.role != "admin":
        order_query = order_query.filter(Order.user_id == current_user.id)
    if order_query.first() is None:
        raise HTTPException(status_code=404, detail="Order not found")

    job = BackgroundJob(
        id=str(uuid.uuid4()),
        owner_id=current_user.id,
        kind="invoice",
        status="pending",
        progress=0,
        message="Invoice queued.",
        result=json.dumps({"order_id": order_id}),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    try:
        generate_invoice.apply_async(args=[job.id, order_id], task_id=job.id)
    except Exception as error:
        logger.exception("Could not queue invoice job %s", job.id)
        job.status = "failed"
        job.message = "The invoice could not be queued."
        job.error = "Background worker is unavailable. Please try again later."
        db.commit()
        raise HTTPException(
            status_code=503,
            detail="Background worker is unavailable. Please try again later.",
        ) from error
    return _job_response(job)


@router.post(
    "/imports/products",
    response_model=BackgroundJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_product_import_job(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a .csv file.")

    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="CSV files must be 10 MB or smaller.")
    try:
        text = content.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        columns = next(reader, [])
    except (UnicodeDecodeError, csv.Error) as error:
        raise HTTPException(status_code=400, detail="CSV must be valid UTF-8.") from error
    if not REQUIRED_CSV_COLUMNS.issubset({column.strip() for column in columns}):
        raise HTTPException(
            status_code=422,
            detail="CSV must include name, price, and stock columns.",
        )

    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    file_path = IMPORT_DIR / f"{uuid.uuid4()}.csv"
    file_path.write_bytes(content)

    job = BackgroundJob(
        id=str(uuid.uuid4()),
        owner_id=current_user.id,
        kind="product_import",
        status="pending",
        progress=0,
        message="Product import queued.",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    try:
        import_products_csv.apply_async(
            args=[job.id, str(file_path)],
            task_id=job.id,
        )
    except Exception as error:
        logger.exception("Could not queue product import job %s", job.id)
        db.delete(job)
        db.commit()
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=503,
            detail="Background worker is unavailable. Please try again later.",
        ) from error
    return _job_response(job)


@router.get("/{job_id}/download")
def download_job_result(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        normalized_id = str(uuid.UUID(job_id))
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Background job not found") from error
    query = db.query(BackgroundJob).filter(BackgroundJob.id == normalized_id)
    if current_user.role != "admin":
        query = query.filter(BackgroundJob.owner_id == current_user.id)
    job = query.first()
    if job is None:
        raise HTTPException(status_code=404, detail="Background job not found")
    if job.kind != "invoice" or job.status != "completed" or not job.result:
        raise HTTPException(status_code=409, detail="Invoice is not ready to download.")

    filename = json.loads(job.result).get("filename")
    expected_filename = f"invoice-{normalized_id}.pdf"
    if filename != expected_filename:
        raise HTTPException(status_code=404, detail="Invoice file not found.")
    invoice_path = BACKEND_DIR / "app" / "uploads" / "invoices" / expected_filename
    if not invoice_path.is_file():
        raise HTTPException(status_code=404, detail="Invoice file not found.")
    return FileResponse(
        invoice_path,
        media_type="application/pdf",
        filename=f"invoice-order-{json.loads(job.result)['order_id']}.pdf",
    )
