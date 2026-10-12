import json
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import sessionmaker

from app.models import BackgroundJob, Order
from app.routers import jobs as jobs_router
from app import tasks


def test_customer_can_queue_invoice_for_their_order(
    client,
    auth_headers,
    test_user,
    db,
    monkeypatch,
):
    order = Order(
        user_id=test_user.id,
        total_amount=125.0,
        status="confirmed",
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    queued = []
    monkeypatch.setattr(
        jobs_router.generate_invoice,
        "apply_async",
        lambda **kwargs: queued.append(kwargs),
    )

    response = client.post(
        f"/api/jobs/invoices/{order.id}",
        headers=auth_headers,
    )

    assert response.status_code == 202
    assert response.json()["kind"] == "invoice"
    assert response.json()["status"] == "pending"
    assert UUID(response.json()["id"])
    assert queued == [{
        "args": [response.json()["id"], order.id],
        "task_id": response.json()["id"],
    }]
    assert client.get("/api/jobs/", headers=auth_headers).json()[0]["id"] == response.json()["id"]


def test_customer_cannot_queue_invoice_for_another_users_order(
    client,
    auth_headers,
    db,
):
    from app.models import User

    other_user = User(
        name="Other Customer",
        email="other-customer@example.com",
        hashed_password="not-used",
        is_active=True,
    )
    db.add(other_user)
    db.flush()
    order = Order(
        user_id=other_user.id,
        total_amount=125.0,
        status="confirmed",
    )
    db.add(order)
    db.commit()

    response = client.post(
        f"/api/jobs/invoices/{order.id}",
        headers=auth_headers,
    )

    assert response.status_code == 404


def test_admin_can_queue_product_csv_import(
    client,
    admin_headers,
    monkeypatch,
):
    queued = []
    monkeypatch.setattr(
        jobs_router.import_products_csv,
        "apply_async",
        lambda **kwargs: queued.append(kwargs),
    )
    response = client.post(
        "/api/jobs/imports/products",
        headers=admin_headers,
        files={
            "file": (
                "products.csv",
                b"name,price,stock,description\nDesk lamp,29.99,12,LED lamp\n",
                "text/csv",
            )
        },
    )

    assert response.status_code == 202
    assert response.json()["kind"] == "product_import"
    assert len(queued) == 1
    import_path = Path(queued[0]["args"][1])
    try:
        assert import_path.is_file()
        assert import_path.read_text(encoding="utf-8").startswith("name,price,stock")
    finally:
        import_path.unlink(missing_ok=True)


def test_product_csv_import_requires_admin(client, auth_headers):
    response = client.post(
        "/api/jobs/imports/products",
        headers=auth_headers,
        files={"file": ("products.csv", b"name,price,stock\n", "text/csv")},
    )

    assert response.status_code == 403


def test_background_jobs_are_private_to_their_owner(
    client,
    auth_headers,
    test_user,
    db,
):
    from app.models import User

    owner = User(
        name="Other Job Owner",
        email="job-owner@example.com",
        hashed_password="not-used",
        is_active=True,
    )
    db.add(owner)
    db.flush()
    job = BackgroundJob(
        id="fb20901a-d3be-4d5d-96dd-58c72dd92a22",
        owner_id=owner.id,
        kind="invoice",
        status="completed",
        progress=100,
        message="Invoice is ready.",
        result=json.dumps({"order_id": 1, "filename": "invoice-fb20901a-d3be-4d5d-96dd-58c72dd92a22.pdf"}),
    )
    db.add(job)
    db.commit()

    response = client.get(f"/api/jobs/{job.id}", headers=auth_headers)

    assert response.status_code == 404


def test_invoice_task_writes_pdf_and_persists_completion(
    db,
    test_user,
    test_product,
    monkeypatch,
):
    from app.models import OrderItem
    order = Order(
        user_id=test_user.id,
        total_amount=200.0,
        delivery_address="10 Market Road",
        status="confirmed",
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(
        order_id=order.id,
        product_id=test_product.id,
        quantity=2,
        price=100.0,
    ))
    job = BackgroundJob(
        id="b973d872-95f0-4fd2-a2fb-605f0da4d1b0",
        owner_id=test_user.id,
        kind="invoice",
        status="pending",
        progress=0,
        message="Invoice queued.",
    )
    db.add(job)
    db.commit()
    monkeypatch.setattr(tasks, "SessionLocal", sessionmaker(bind=db.get_bind()))
    monkeypatch.setattr(tasks.generate_invoice, "update_state", lambda **kwargs: None)

    try:
        result = tasks.generate_invoice.run(job.id, order.id)
        db.expire_all()
        persisted_job = db.get(BackgroundJob, job.id)
        invoice_path = tasks.INVOICE_DIR / result["filename"]

        assert persisted_job.status == "completed"
        assert persisted_job.progress == 100
        assert json.loads(persisted_job.result)["order_id"] == order.id
        assert invoice_path.read_bytes().startswith(b"%PDF")
    finally:
        (tasks.INVOICE_DIR / f"invoice-{job.id}.pdf").unlink(missing_ok=True)


def test_product_import_task_reports_progress_and_rejected_rows(
    db,
    test_user,
    monkeypatch,
):
    from app.models import Product

    tasks.JOB_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    job = BackgroundJob(
        id="d1b1f49d-8744-4967-957e-64aedf8d8a79",
        owner_id=test_user.id,
        kind="product_import",
        status="pending",
        progress=0,
        message="Product import queued.",
    )
    db.add(job)
    db.commit()
    csv_path = tasks.JOB_UPLOAD_DIR / "task-test-import.csv"
    rows = ["name,price,stock,description"]
    rows.extend(f"Item {index},10.50,2,Test item" for index in range(204))
    rows.insert(80, "Broken item,not-a-price,2,Invalid row")
    csv_path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    progress_updates = []
    monkeypatch.setattr(tasks, "SessionLocal", sessionmaker(bind=db.get_bind()))
    monkeypatch.setattr(
        tasks.import_products_csv,
        "update_state",
        lambda **kwargs: progress_updates.append(kwargs["meta"]),
    )

    result = tasks.import_products_csv.run(job.id, str(csv_path))
    db.expire_all()
    persisted_job = db.get(BackgroundJob, job.id)

    assert result["processed"] == 205
    assert result["imported"] == 204
    assert result["rejected"] == 1
    assert "price must be a number" in result["errors"][0]
    assert persisted_job.status == "completed"
    assert persisted_job.progress == 100
    assert db.query(Product).filter(Product.name.like("Item %")).count() == 204
    assert any(0 < update["progress"] < 100 for update in progress_updates)
    assert not csv_path.exists()
