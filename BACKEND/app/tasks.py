import csv
import json
import logging
from pathlib import Path
from uuid import UUID

from celery import states
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from sqlalchemy.orm import joinedload

from app.celery_app import celery_app
from app.database import BACKEND_DIR, SessionLocal
from app.image_urls import normalize_product_image_url
from app.models import BackgroundJob, Order, OrderItem, Product
from app.redis_client import redis_client


logger = logging.getLogger(__name__)
JOB_UPLOAD_DIR = BACKEND_DIR / "app" / "uploads" / "imports"
INVOICE_DIR = BACKEND_DIR / "app" / "uploads" / "invoices"
IMPORT_BATCH_SIZE = 100
MAX_IMPORT_ERRORS = 100


def _set_job(
    job_id: str,
    *,
    status: str,
    progress: int,
    message: str,
    result: dict | None = None,
    error: str | None = None,
) -> None:
    with SessionLocal() as db:
        job = db.get(BackgroundJob, job_id)
        if job is None:
            logger.error("Cannot update missing background job %s", job_id)
            return
        job.status = status
        job.progress = progress
        job.message = message
        if result is not None:
            job.result = json.dumps(result)
        if error is not None:
            job.error = error
        db.commit()


def _fail_job(job_id: str, error: Exception) -> None:
    try:
        logger.error(
            "Background job %s failed",
            job_id,
            exc_info=(type(error), error, error.__traceback__),
        )
        with SessionLocal() as db:
            job = db.get(BackgroundJob, job_id)
            if job is None:
                logger.error("Cannot persist failure for missing job %s", job_id)
                return
            job.status = "failed"
            job.message = "The background job could not complete."
            job.error = "The background job failed. Please retry or contact support."
            db.commit()
    except Exception:
        logger.exception("Could not persist failure for background job %s", job_id)


@celery_app.task(bind=True, name="app.tasks.generate_invoice")
def generate_invoice(self, job_id: str, order_id: int) -> dict:
    progress = 10
    try:
        _set_job(
            job_id,
            status="running",
            progress=progress,
            message="Loading order details for the invoice.",
        )
        self.update_state(state="PROGRESS", meta={"progress": progress})
        with SessionLocal() as db:
            job = db.get(BackgroundJob, job_id)
            if job is None:
                raise ValueError("Invoice job was not found.")
            order = (
                db.query(Order)
                .options(
                    joinedload(Order.user),
                    joinedload(Order.items).joinedload(OrderItem.product),
                )
                .filter(Order.id == order_id)
                .first()
            )
            if order is None:
                raise ValueError("The order for this invoice no longer exists.")
            customer_name = order.user.name
            address = order.delivery_address or "Not provided"
            items = [
                (
                    item.product.name if item.product else f"Product #{item.product_id}",
                    item.quantity,
                    item.price,
                )
                for item in order.items
            ]
            total = order.total_amount
            order_created_at = order.created_at

        INVOICE_DIR.mkdir(parents=True, exist_ok=True)
        progress = 50
        _set_job(
            job_id,
            status="running",
            progress=progress,
            message="Rendering the invoice PDF.",
        )
        self.update_state(state="PROGRESS", meta={"progress": progress})
        filename = f"invoice-{UUID(job_id)}.pdf"
        output_path = INVOICE_DIR / filename
        pdf = canvas.Canvas(str(output_path), pagesize=letter)
        _, page_height = letter
        y = page_height - 60
        pdf.setTitle(f"Invoice for order #{order_id}")
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(50, y, f"ShopHub invoice - Order #{order_id}")
        y -= 30
        pdf.setFont("Helvetica", 10)
        pdf.drawString(50, y, f"Customer: {customer_name}")
        y -= 16
        pdf.drawString(50, y, f"Date: {order_created_at:%Y-%m-%d}")
        y -= 16
        pdf.drawString(50, y, f"Delivery address: {address[:100]}")
        y -= 32
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(50, y, "Product")
        pdf.drawString(340, y, "Quantity")
        pdf.drawString(420, y, "Unit price")
        pdf.drawString(510, y, "Amount")
        y -= 18
        pdf.setFont("Helvetica", 10)
        for name, quantity, price in items:
            if y < 60:
                pdf.showPage()
                y = page_height - 60
                pdf.setFont("Helvetica", 10)
            pdf.drawString(50, y, str(name)[:48])
            pdf.drawRightString(390, y, str(quantity))
            pdf.drawRightString(480, y, f"Rs. {price:.2f}")
            pdf.drawRightString(560, y, f"Rs. {price * quantity:.2f}")
            y -= 16
        y -= 12
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawRightString(560, y, f"Total: Rs. {total:.2f}")
        pdf.save()

        result = {"order_id": order_id, "filename": filename}
        progress = 90
        self.update_state(state="PROGRESS", meta={"progress": progress})
        _set_job(
            job_id,
            status="completed",
            progress=100,
            message="Invoice is ready to download.",
            result=result,
        )
        self.update_state(state=states.SUCCESS, meta={"progress": 100, "result": result})
        return result
    except Exception as error:
        _fail_job(job_id, error)
        raise


def _validate_csv_product(row: dict[str, str | None]) -> dict:
    name = (row.get("name") or "").strip()
    description = (row.get("description") or "").strip() or None
    image_url = normalize_product_image_url(row.get("image_url"))
    if not name or len(name) > 200:
        raise ValueError("name must contain 1 to 200 characters")
    if description is not None and len(description) > 1000:
        raise ValueError("description must be at most 1000 characters")
    try:
        price = float(row.get("price") or "")
        stock = int(row.get("stock") or "")
    except (TypeError, ValueError) as error:
        raise ValueError("price must be a number and stock must be an integer") from error
    if not (0 < price < float("inf")):
        raise ValueError("price must be a finite number greater than zero")
    if stock < 0:
        raise ValueError("stock cannot be negative")
    return {
        "name": name,
        "description": description,
        "price": price,
        "stock": stock,
        "image_url": image_url,
        "is_active": True,
    }


@celery_app.task(bind=True, name="app.tasks.import_products_csv")
def import_products_csv(self, job_id: str, file_path: str) -> dict:
    path = Path(file_path).resolve()
    if path.parent != JOB_UPLOAD_DIR.resolve():
        raise ValueError("Import file path is outside the allowed upload directory.")

    processed = imported = 0
    errors: list[str] = []
    batch: list[dict] = []
    total_rows = 0
    try:
        _set_job(
            job_id,
            status="running",
            progress=0,
            message="Preparing CSV product import.",
        )
        self.update_state(state="PROGRESS", meta={"processed": 0, "imported": 0, "progress": 0})
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            total_rows = max(sum(1 for _ in csv.reader(source)) - 1, 0)
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            required = {"name", "price", "stock"}
            if not reader.fieldnames or not required.issubset(
                {field.strip() for field in reader.fieldnames}
            ):
                raise ValueError("CSV must include name, price, and stock columns.")

            for row_number, row in enumerate(reader, start=2):
                processed += 1
                try:
                    normalized = {key.strip(): value for key, value in row.items() if key}
                    batch.append(_validate_csv_product(normalized))
                except ValueError as error:
                    if len(errors) < MAX_IMPORT_ERRORS:
                        errors.append(f"Row {row_number}: {error}")

                if len(batch) >= IMPORT_BATCH_SIZE:
                    with SessionLocal() as db:
                        db.bulk_insert_mappings(Product, batch)
                        db.commit()
                    imported += len(batch)
                    batch.clear()
                if processed % IMPORT_BATCH_SIZE == 0:
                    progress = min(int(processed * 100 / max(total_rows, 1)), 99)
                    _set_job(
                        job_id,
                        status="running",
                        progress=progress,
                        message=f"Processed {processed} rows; imported {imported}.",
                    )
                    self.update_state(
                        state="PROGRESS",
                        meta={
                            "processed": processed,
                            "imported": imported,
                            "progress": progress,
                        },
                    )

            if batch:
                with SessionLocal() as db:
                    db.bulk_insert_mappings(Product, batch)
                    db.commit()
                imported += len(batch)

        result = {
            "processed": processed,
            "imported": imported,
            "rejected": processed - imported,
            "errors": errors,
            "errors_truncated": processed - imported > len(errors),
        }
        redis_client.delete("products:all")
        _set_job(
            job_id,
            status="completed",
            progress=100,
            message=f"Import finished: {imported} products imported, {processed - imported} rejected.",
            result=result,
        )
        self.update_state(state=states.SUCCESS, meta={"progress": 100, "result": result})
        return result
    except Exception as error:
        _fail_job(job_id, error)
        raise
    finally:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.exception("Could not remove completed import file %s", path)
