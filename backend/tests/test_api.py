import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.dependencies import get_db
from app.main import app

from app.models import (
    Supplier,
)


# ============================================================
# TEST DATABASE FIXTURE
# ============================================================

@pytest.fixture
def client(monkeypatch):

    test_engine = create_engine(
        "sqlite://",
        connect_args={
            "check_same_thread": False,
        },
        poolclass=StaticPool,
    )

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine,
    )

    Base.metadata.create_all(
        bind=test_engine,
    )

    def override_get_db():

        db = TestingSessionLocal()

        try:
            yield db

        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # --------------------------------------------------------
    # MOCK META API
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # CREATE TEST SUPPLIER
    # --------------------------------------------------------

    db = TestingSessionLocal()

    supplier = Supplier(
        name="Test Supplier",
        is_active=True,
    )

    db.add(supplier)
    db.commit()
    db.refresh(supplier)

    supplier_id = supplier.id

    db.close()

    # --------------------------------------------------------
    # START TEST CLIENT
    # --------------------------------------------------------

    with TestClient(app) as test_client:

        test_client.app.state.test_supplier_id = supplier_id

        yield test_client

    # --------------------------------------------------------
    # CLEANUP
    # --------------------------------------------------------

    app.dependency_overrides.clear()

    Base.metadata.drop_all(
        bind=test_engine,
    )

    test_engine.dispose()


# ============================================================
# TEST HELPERS
# ============================================================

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


def create_order_proposal(
    client,
    investigation_id: int,
    quantity: int,
):
    """
    Create an order proposal using an explicitly selected
    active supplier.
    """

    return client.post(
        "/api/orders/propose",
        json={
            "investigation_id": investigation_id,
            "quantity": quantity,
            "supplier_id": client.app.state.test_supplier_id,
        },
    )


# ============================================================
# HEALTH CHECK
# ============================================================

def test_health_endpoint(client):

    response = client.get("/health")

    assert response.status_code == 200

    assert response.json()["status"] == "ok"


# ============================================================
# PROPOSE AND APPROVE ORDER
# ============================================================

def test_propose_and_approve_order(client):

    investigation_id = create_shortage(client)

    proposal = create_order_proposal(
        client,
        investigation_id,
        quantity=12,
    )

    assert proposal.status_code == 200, proposal.text

    order = proposal.json()

    assert order["status"] == "pending_approval"

    assert order["supplier_id"] == (
        client.app.state.test_supplier_id
    )

    assert order["supplier_name"] == "Test Supplier"

    # --------------------------------------------------------
    # APPROVE ORDER
    # --------------------------------------------------------

    decision = client.post(
        f"/api/orders/{order['order_id']}/decision",
        json={
            "decision": "approve",
            "approved_by": "Test Owner",
        },
    )

    assert decision.status_code == 200, decision.text

    assert decision.json()["status"] == "simulated_ordered"

    # --------------------------------------------------------
    # VERIFY ORDER
    # --------------------------------------------------------

    verification = client.get(
        f"/api/orders/{order['order_id']}"
    )

    assert verification.status_code == 200

    verification_data = verification.json()

    assert verification_data["verification"]["record_exists"] is True

    assert verification_data["verification"]["supplier_order_sent"] is False


# ============================================================
# CANNOT DECIDE ORDER TWICE
# ============================================================

def test_cannot_decide_order_twice(client):

    investigation_id = create_shortage(client)

    proposal = create_order_proposal(
        client,
        investigation_id,
        quantity=5,
    )

    assert proposal.status_code == 200, proposal.text

    order_id = proposal.json()["order_id"]

    # --------------------------------------------------------
    # FIRST DECISION: REJECT
    # --------------------------------------------------------

    first_decision = client.post(
        f"/api/orders/{order_id}/decision",
        json={
            "decision": "reject",
            "approved_by": "Test Owner",
        },
    )

    assert first_decision.status_code == 200

    assert first_decision.json()["status"] == "rejected"

    # --------------------------------------------------------
    # SECOND DECISION MUST FAIL
    # --------------------------------------------------------

    second_decision = client.post(
        f"/api/orders/{order_id}/decision",
        json={
            "decision": "approve",
            "approved_by": "Test Owner",
        },
    )

    assert second_decision.status_code == 409


# ============================================================
# MISSING INVESTIGATION
# ============================================================

def test_missing_investigation_returns_404(client):

    response = client.post(
        "/api/orders/propose",
        json={
            "investigation_id": 99999,
            "quantity": 5,
            "supplier_id": client.app.state.test_supplier_id,
        },
    )

    assert response.status_code == 404


# ============================================================
# ORDER HISTORY FILTER
# ============================================================

def test_order_history_filters_by_status(client):

    investigation_id = create_shortage(client)

    proposal = create_order_proposal(
        client,
        investigation_id,
        quantity=5,
    )

    assert proposal.status_code == 200, proposal.text

    response = client.get(
        "/api/orders",
        params={
            "status": "pending_approval",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["total"] == 1

    assert data["items"][0]["status"] == "pending_approval"

    assert data["items"][0]["supplier_name"] == "Test Supplier"


# ============================================================
# DUPLICATE ORDER PROPOSAL
# ============================================================

def test_duplicate_order_proposal_returns_409(client):

    investigation_id = create_shortage(client)

    first_response = create_order_proposal(
        client,
        investigation_id,
        quantity=10,
    )

    assert first_response.status_code == 200, first_response.text

    second_response = create_order_proposal(
        client,
        investigation_id,
        quantity=10,
    )

    assert second_response.status_code == 409

    assert "already exists" in second_response.json()["detail"]