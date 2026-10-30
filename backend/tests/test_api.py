from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.dependencies import get_db
from app.main import app
from app.models import Investigation, Product, SupplierOrder


@pytest.fixture
def client(monkeypatch):
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine,
    )

    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Mock Meta API: tests must not make real API calls.
    from app.api import inventory as inventory_api

    monkeypatch.setattr(
        inventory_api,
        "generate_response",
     lambda prompt: (
    '{"summary":"Test investigation completed.",'
    '"possible_causes":["Counting error"],'
    '"missing_evidence":["Sales records"],'
    '"recommended_action":"Recount stock.",'
    '"confidence":"low"}'
),
    )

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


def create_shortage(client):
    response = client.post(
        "/api/inventory/investigate",
        json={
            "product_name": "Test Cola",
            "expected_stock": 24,
            "physical_stock": 17,
            "units_sold": 4,
            "evidence_notes": "Test evidence",
        },
    )

    assert response.status_code == 200, response.text
    return response.json()["investigation_id"]


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_propose_and_approve_order(client):
    investigation_id = create_shortage(client)

    proposal = client.post(
        "/api/orders/propose",
        json={
            "investigation_id": investigation_id,
            "quantity": 12,
        },
    )

    assert proposal.status_code == 200, proposal.text
    order = proposal.json()
    assert order["status"] == "pending_approval"

    decision = client.post(
        f"/api/orders/{order['order_id']}/decision",
        json={
            "decision": "approve",
            "approved_by": "Test Owner",
        },
    )

    assert decision.status_code == 200, decision.text
    assert decision.json()["status"] == "simulated_ordered"

    verification = client.get(f"/api/orders/{order['order_id']}")

    assert verification.status_code == 200
    assert verification.json()["verification"]["record_exists"] is True
    assert verification.json()["verification"]["supplier_order_sent"] is False


def test_cannot_decide_order_twice(client):
    investigation_id = create_shortage(client)

    proposal = client.post(
        "/api/orders/propose",
        json={
            "investigation_id": investigation_id,
            "quantity": 5,
        },
    )

    order_id = proposal.json()["order_id"]

    first_decision = client.post(
        f"/api/orders/{order_id}/decision",
        json={
            "decision": "reject",
            "approved_by": "Test Owner",
        },
    )

    assert first_decision.status_code == 200
    assert first_decision.json()["status"] == "rejected"

    second_decision = client.post(
        f"/api/orders/{order_id}/decision",
        json={
            "decision": "approve",
            "approved_by": "Test Owner",
        },
    )

    assert second_decision.status_code == 409


def test_missing_investigation_returns_404(client):
    response = client.post(
        "/api/orders/propose",
        json={
            "investigation_id": 99999,
            "quantity": 5,
        },
    )

    assert response.status_code == 404


def test_order_history_filters_by_status(client):
    investigation_id = create_shortage(client)

    client.post(
        "/api/orders/propose",
        json={
            "investigation_id": investigation_id,
            "quantity": 5,
        },
    )

    response = client.get(
        "/api/orders",
        params={"status": "pending_approval"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "pending_approval"


def test_duplicate_order_proposal_returns_409(client):
    investigation_id = create_shortage(client)

    payload = {
        "investigation_id": investigation_id,
        "quantity": 10,
    }

    first_response = client.post(
        "/api/orders/propose",
        json=payload,
    )

    assert first_response.status_code == 200, first_response.text

    second_response = client.post(
        "/api/orders/propose",
        json=payload,
    )

    assert second_response.status_code == 409
    assert "already exists" in second_response.json()["detail"]