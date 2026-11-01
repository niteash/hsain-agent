import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.dependencies import get_db
from app.main import app
from app.models import Product, Supplier


@pytest.fixture
def product_supplier_environment():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
        expire_on_commit=False,
    )

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client, TestingSessionLocal
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)

        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def create_product(client, **overrides):
    payload = {
        "name": "Test Cola",
        "sku": "COLA-001",
        "minimum_stock": 5,
        "reorder_point": 15,
        "maximum_stock": 100,
        "lead_time_days": 5,
        "safety_buffer_days": 3,
    }

    payload.update(overrides)

    return client.post(
        "/api/products/",
        json=payload,
    )


def create_supplier(client, **overrides):
    payload = {
        "name": "ABC Distributors",
        "contact_person": "John",
        "email": "john@example.com",
        "phone": "9876543210",
        "address": "Delhi, India",
    }

    payload.update(overrides)

    return client.post(
        "/api/suppliers/",
        json=payload,
    )


def get_product_from_db(SessionLocal, product_id):
    db = SessionLocal()

    try:
        return db.get(Product, product_id)

    finally:
        db.close()


def get_supplier_from_db(SessionLocal, supplier_id):
    db = SessionLocal()

    try:
        return db.get(Supplier, supplier_id)

    finally:
        db.close()


# ============================================================
# PRODUCT TESTS
# ============================================================

def test_create_product_with_replenishment_configuration(
    product_supplier_environment,
):
    client, _ = product_supplier_environment

    response = create_product(client)

    assert response.status_code == 201, response.text

    data = response.json()

    assert data["name"] == "Test Cola"
    assert data["current_stock"] == 0
    assert data["minimum_stock"] == 5
    assert data["reorder_point"] == 15
    assert data["maximum_stock"] == 100
    assert data["lead_time_days"] == 5
    assert data["safety_buffer_days"] == 3
    assert data["preferred_supplier_id"] is None


def test_product_accepts_zero_day_configuration(
    product_supplier_environment,
):
    client, _ = product_supplier_environment

    response = create_product(
        client,
        lead_time_days=0,
        safety_buffer_days=0,
    )

    assert response.status_code == 201, response.text

    data = response.json()

    assert data["lead_time_days"] == 0
    assert data["safety_buffer_days"] == 0


def test_product_rejects_invalid_stock_thresholds(
    product_supplier_environment,
):
    client, _ = product_supplier_environment

    response = create_product(
        client,
        minimum_stock=30,
        reorder_point=15,
        maximum_stock=100,
    )

    assert response.status_code == 422


def test_update_product_configuration_preserves_current_stock(
    product_supplier_environment,
):
    client, SessionLocal = product_supplier_environment

    response = create_product(client)

    assert response.status_code == 201

    product_id = response.json()["id"]

    db = SessionLocal()

    try:
        product = db.get(Product, product_id)
        product.current_stock = 42
        db.commit()

    finally:
        db.close()

    update_response = client.patch(
        f"/api/products/{product_id}",
        json={
            "minimum_stock": 10,
            "reorder_point": 25,
            "maximum_stock": 120,
            "lead_time_days": 7,
            "safety_buffer_days": 4,
            "current_stock": 999,
        },
    )

    assert update_response.status_code == 200, update_response.text

    data = update_response.json()

    assert data["minimum_stock"] == 10
    assert data["reorder_point"] == 25
    assert data["maximum_stock"] == 120
    assert data["lead_time_days"] == 7
    assert data["safety_buffer_days"] == 4

    assert data["current_stock"] == 42

    product = get_product_from_db(SessionLocal, product_id)

    assert product.current_stock == 42


def test_update_product_rejects_invalid_threshold_combination(
    product_supplier_environment,
):
    client, _ = product_supplier_environment

    response = create_product(client)

    product_id = response.json()["id"]

    update_response = client.patch(
        f"/api/products/{product_id}",
        json={
            "minimum_stock": 30,
        },
    )

    assert update_response.status_code == 422


def test_update_product_returns_404_for_missing_product(
    product_supplier_environment,
):
    client, _ = product_supplier_environment

    response = client.patch(
        "/api/products/9999",
        json={"lead_time_days": 5},
    )

    assert response.status_code == 404


# ============================================================
# SUPPLIER TESTS
# ============================================================

def test_create_supplier(product_supplier_environment):
    client, _ = product_supplier_environment

    response = create_supplier(client)

    assert response.status_code == 201, response.text

    data = response.json()

    assert data["name"] == "ABC Distributors"
    assert data["contact_person"] == "John"
    assert data["email"] == "john@example.com"
    assert data["is_active"] is True


def test_duplicate_supplier_name_is_rejected(
    product_supplier_environment,
):
    client, _ = product_supplier_environment

    first_response = create_supplier(client)

    assert first_response.status_code == 201

    second_response = create_supplier(client)

    assert second_response.status_code == 409


def test_assign_preferred_supplier_to_product(
    product_supplier_environment,
):
    client, _ = product_supplier_environment

    supplier_response = create_supplier(client)

    supplier_id = supplier_response.json()["id"]

    product_response = create_product(
        client,
        preferred_supplier_id=supplier_id,
    )

    assert product_response.status_code == 201, product_response.text

    assert (
        product_response.json()["preferred_supplier_id"]
        == supplier_id
    )


def test_product_rejects_nonexistent_supplier(
    product_supplier_environment,
):
    client, _ = product_supplier_environment

    response = create_product(
        client,
        preferred_supplier_id=9999,
    )

    assert response.status_code == 404


def test_product_rejects_inactive_supplier(
    product_supplier_environment,
):
    client, _ = product_supplier_environment

    supplier_response = create_supplier(client)

    supplier_id = supplier_response.json()["id"]

    deactivate_response = client.patch(
        f"/api/suppliers/{supplier_id}",
        json={"is_active": False},
    )

    assert deactivate_response.status_code == 200

    product_response = create_product(
        client,
        preferred_supplier_id=supplier_id,
    )

    assert product_response.status_code == 422


def test_supplier_deactivation_preserves_product_association(
    product_supplier_environment,
):
    client, SessionLocal = product_supplier_environment

    supplier_response = create_supplier(client)

    supplier_id = supplier_response.json()["id"]

    product_response = create_product(
        client,
        preferred_supplier_id=supplier_id,
    )

    product_id = product_response.json()["id"]

    deactivate_response = client.patch(
        f"/api/suppliers/{supplier_id}",
        json={"is_active": False},
    )

    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["is_active"] is False

    product = get_product_from_db(SessionLocal, product_id)
    supplier = get_supplier_from_db(SessionLocal, supplier_id)

    assert product is not None
    assert supplier is not None

    assert product.preferred_supplier_id == supplier_id
    assert supplier.is_active is False


def test_supplier_list_can_filter_active_suppliers(
    product_supplier_environment,
):
    client, _ = product_supplier_environment

    active_response = create_supplier(
        client,
        name="Active Supplier",
    )

    inactive_response = create_supplier(
        client,
        name="Inactive Supplier",
    )

    assert active_response.status_code == 201
    assert inactive_response.status_code == 201

    inactive_id = inactive_response.json()["id"]

    client.patch(
        f"/api/suppliers/{inactive_id}",
        json={"is_active": False},
    )

    response = client.get(
        "/api/suppliers/",
        params={"active_only": True},
    )

    assert response.status_code == 200

    suppliers = response.json()

    assert len(suppliers) == 1
    assert suppliers[0]["name"] == "Active Supplier"