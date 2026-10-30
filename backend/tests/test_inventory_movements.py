import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.dependencies import get_db
from app.main import app
from app.models import (
    EvidenceAnalysis,
    EvidenceExtraction,
    EvidenceFile,
    Investigation,
    Product,
    StockMovement,
)


@pytest.fixture
def movement_environment():
    """Create an isolated in-memory database for every test."""

    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine,
        expire_on_commit=False,
    )

    Base.metadata.create_all(bind=test_engine)

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

        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()


def create_movement_fixture(
    SessionLocal,
    document_type="delivery_note",
    quantity_type="quantity_delivered",
    quantity=10,
    is_inventory_relevant=True,
):
    db = SessionLocal()

    try:
        product = Product(
            name="Test Cola",
            sku="COLA-001",
            current_stock=20,
        )

        db.add(product)
        db.flush()

        investigation = Investigation(
            product_id=product.id,
            expected_stock=20,
            physical_stock=20,
            units_sold=0,
            expected_remaining_stock=20,
            discrepancy=0,
            status="matched",
            investigation="Test investigation",
            recommended_action="No action required",
            evidence_notes="Movement test",
        )

        db.add(investigation)
        db.flush()

        evidence = EvidenceFile(
            investigation_id=investigation.id,
            original_filename="test_evidence.pdf",
            stored_filename="test_evidence.pdf",
            content_type="application/pdf",
            file_size=100,
            storage_path="test/test_evidence.pdf",
        )

        db.add(evidence)
        db.flush()

        extraction = EvidenceExtraction(
            evidence_id=evidence.id,
            extracted_text="Test inventory evidence",
            status="completed",
            page_count=1,
        )

        analysis_data = {
            "document_type": document_type,
            "is_inventory_relevant": is_inventory_relevant,
            "detected_entities": [],
            "inventory_data": {
                "line_items": [
                    {
                        "product_name": "Test Cola",
                        "sku": "COLA-001",
                        "quantity": quantity,
                        "quantity_unit": "units",
                        "quantity_type": quantity_type,
                        "unit_price": 20,
                        "total_price": quantity * 20,
                        "currency": "INR",
                    }
                ],
                "invoice_number": None,
                "invoice_date": None,
                "currency": "INR",
            },
            "observations": [],
            "limitations": [],
        }

        analysis = EvidenceAnalysis(
            evidence_id=evidence.id,
            document_type=document_type,
            is_inventory_relevant=is_inventory_relevant,
            analysis_json=json.dumps(analysis_data),
            model="test-model",
        )

        db.add_all([extraction, analysis])
        db.commit()

        return {
            "product_id": product.id,
            "investigation_id": investigation.id,
            "evidence_id": evidence.id,
        }

    finally:
        db.close()


def create_movement_proposal(
    client,
    SessionLocal,
    movement_type="receipt",
    document_type="delivery_note",
    quantity_type="quantity_delivered",
    quantity=10,
    is_inventory_relevant=True,
):
    fixture = create_movement_fixture(
        SessionLocal,
        document_type=document_type,
        quantity_type=quantity_type,
        quantity=quantity,
        is_inventory_relevant=is_inventory_relevant,
    )

    response = client.post(
        "/api/inventory-movements/propose",
        params={
            "investigation_id": fixture["investigation_id"],
            "evidence_id": fixture["evidence_id"],
        },
        json={
            "movement_type": movement_type,
            "quantity": quantity,
            "source_line_item_index": 0,
            "reason": "Verified inventory evidence",
        },
    )

    return fixture, response


def create_receipt_proposal(client, SessionLocal):
    fixture, response = create_movement_proposal(
        client,
        SessionLocal,
    )

    assert response.status_code == 200, response.text

    return fixture, response.json()


def get_product_stock(SessionLocal, product_id):
    db = SessionLocal()

    try:
        product = db.get(Product, product_id)
        assert product is not None
        return product.current_stock

    finally:
        db.close()


def get_stock_movements(SessionLocal, product_id):
    db = SessionLocal()

    try:
        return (
            db.query(StockMovement)
            .filter_by(product_id=product_id)
            .all()
        )

    finally:
        db.close()


def test_receipt_proposal_starts_pending(movement_environment):
    client, SessionLocal = movement_environment

    _, proposal = create_receipt_proposal(client, SessionLocal)

    assert proposal["status"] == "pending_approval"
    assert proposal["quantity"] == 10
    assert proposal["quantity_delta"] == 10


def test_receipt_approval_increases_stock(movement_environment):
    client, SessionLocal = movement_environment

    fixture, proposal = create_receipt_proposal(
        client,
        SessionLocal,
    )

    response = client.post(
        f"/api/inventory-movements/{proposal['id']}/decision",
        json={
            "decision": "approve",
            "approved_by": "Test Owner",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "approved"
    assert response.json()["updated_stock"] == 30

    assert get_product_stock(
        SessionLocal,
        fixture["product_id"],
    ) == 30

    movements = get_stock_movements(
        SessionLocal,
        fixture["product_id"],
    )

    assert len(movements) == 1
    assert movements[0].quantity_delta == 10


def test_rejection_does_not_change_stock(movement_environment):
    client, SessionLocal = movement_environment

    fixture, proposal = create_receipt_proposal(
        client,
        SessionLocal,
    )

    response = client.post(
        f"/api/inventory-movements/{proposal['id']}/decision",
        json={
            "decision": "reject",
            "approved_by": "Test Owner",
            "rejection_reason": "Incorrect delivery quantity",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "rejected"

    assert get_product_stock(
        SessionLocal,
        fixture["product_id"],
    ) == 20

    assert len(
        get_stock_movements(SessionLocal, fixture["product_id"])
    ) == 0


def test_proposal_cannot_be_approved_twice(movement_environment):
    client, SessionLocal = movement_environment

    fixture, proposal = create_receipt_proposal(
        client,
        SessionLocal,
    )

    payload = {
        "decision": "approve",
        "approved_by": "Test Owner",
    }

    first = client.post(
        f"/api/inventory-movements/{proposal['id']}/decision",
        json=payload,
    )

    second = client.post(
        f"/api/inventory-movements/{proposal['id']}/decision",
        json=payload,
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 409

    assert get_product_stock(
        SessionLocal,
        fixture["product_id"],
    ) == 30

    assert len(
        get_stock_movements(SessionLocal, fixture["product_id"])
    ) == 1


def test_audit_history_endpoint(movement_environment):
    client, SessionLocal = movement_environment

    _, proposal = create_receipt_proposal(
        client,
        SessionLocal,
    )

    response = client.get(
        f"/api/inventory-movements/{proposal['id']}/audit"
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["proposal_id"] == proposal["id"]
    assert data["total"] >= 1
    assert len(data["items"]) == data["total"]

    actions = [item["action"] for item in data["items"]]

    assert "created" in actions


def test_missing_proposal_audit_returns_404(movement_environment):
    client, _ = movement_environment

    response = client.get(
        "/api/inventory-movements/999999/audit"
    )

    assert response.status_code == 404


def test_sales_proposal_starts_pending(movement_environment):
    client, SessionLocal = movement_environment

    _, response = create_movement_proposal(
        client,
        SessionLocal,
        movement_type="sale",
        document_type="sales_report",
        quantity_type="quantity_sold",
        quantity=8,
    )

    assert response.status_code == 200, response.text

    proposal = response.json()

    assert proposal["status"] == "pending_approval"
    assert proposal["quantity"] == 8
    assert proposal["quantity_delta"] == -8


def test_sales_approval_decreases_stock(movement_environment):
    client, SessionLocal = movement_environment

    fixture, response = create_movement_proposal(
        client,
        SessionLocal,
        movement_type="sale",
        document_type="sales_report",
        quantity_type="quantity_sold",
        quantity=8,
    )

    assert response.status_code == 200, response.text

    proposal = response.json()

    decision = client.post(
        f"/api/inventory-movements/{proposal['id']}/decision",
        json={
            "decision": "approve",
            "approved_by": "Test Owner",
        },
    )

    assert decision.status_code == 200, decision.text
    assert decision.json()["status"] == "approved"
    assert decision.json()["updated_stock"] == 12

    assert get_product_stock(
        SessionLocal,
        fixture["product_id"],
    ) == 12

    movements = get_stock_movements(
        SessionLocal,
        fixture["product_id"],
    )

    assert len(movements) == 1
    assert movements[0].quantity_delta == -8


def test_sales_cannot_make_stock_negative(movement_environment):
    client, SessionLocal = movement_environment

    fixture, response = create_movement_proposal(
        client,
        SessionLocal,
        movement_type="sale",
        document_type="sales_report",
        quantity_type="quantity_sold",
        quantity=25,
    )

    assert response.status_code == 200, response.text

    proposal = response.json()

    decision = client.post(
        f"/api/inventory-movements/{proposal['id']}/decision",
        json={
            "decision": "approve",
            "approved_by": "Test Owner",
        },
    )

    assert decision.status_code == 422
    assert "negative" in decision.json()["detail"].lower()

    assert get_product_stock(
        SessionLocal,
        fixture["product_id"],
    ) == 20

    assert len(
        get_stock_movements(SessionLocal, fixture["product_id"])
    ) == 0


def test_invoice_cannot_create_receipt_movement(movement_environment):
    client, SessionLocal = movement_environment

    _, response = create_movement_proposal(
        client,
        SessionLocal,
        movement_type="receipt",
        document_type="supplier_invoice",
        quantity_type="quantity_delivered",
        quantity=10,
    )

    assert response.status_code == 422


def test_unverified_quantity_cannot_create_receipt(movement_environment):
    client, SessionLocal = movement_environment

    _, response = create_movement_proposal(
        client,
        SessionLocal,
        movement_type="receipt",
        document_type="delivery_note",
        quantity_type="unknown",
        quantity=10,
    )

    assert response.status_code == 422


def test_unrelated_document_cannot_create_movement(movement_environment):
    client, SessionLocal = movement_environment

    _, response = create_movement_proposal(
        client,
        SessionLocal,
        movement_type="receipt",
        document_type="delivery_note",
        quantity_type="quantity_delivered",
        quantity=10,
        is_inventory_relevant=False,
    )

    assert response.status_code == 422


def test_sales_report_cannot_create_receipt_movement(movement_environment):
    client, SessionLocal = movement_environment

    _, response = create_movement_proposal(
        client,
        SessionLocal,
        movement_type="receipt",
        document_type="sales_report",
        quantity_type="quantity_sold",
        quantity=10,
    )

    assert response.status_code == 422


def test_delivery_note_cannot_create_sales_movement(movement_environment):
    client, SessionLocal = movement_environment

    _, response = create_movement_proposal(
        client,
        SessionLocal,
        movement_type="sale",
        document_type="delivery_note",
        quantity_type="quantity_delivered",
        quantity=10,
    )

    assert response.status_code == 422