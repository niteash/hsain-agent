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
    Product,
    AIInvestigationReport,
)

from unittest.mock import patch

from tests.test_investigation_report_schema import (
    valid_report,
)


@pytest.fixture
def client():

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

    db = TestingSessionLocal()

    product = Product(
        name="Test Cola",
        sku="TEST-COLA",
        current_stock=24,
    )

    db.add(product)
    db.commit()
    db.refresh(product)

    product_id = product.id

    db.close()

    with TestClient(app) as test_client:

        yield test_client, product_id

    app.dependency_overrides.clear()

    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


def mock_context(product_id):

    return {
        "product": {
            "id": product_id,
            "name": "Test Cola",
            "sku": "TEST-COLA",
            "current_stock": 24,
        },
        "context_metadata": {
            "product_id": product_id,
            "total_movements": 0,
            "total_discrepancy_alerts": 0,
            "total_proposals": 0,
            "total_previous_investigations": 0,
            "opening_balance_available": False,
        },
    }


@patch(
    "app.services.investigation_service.generate_response"
)
@patch(
    "app.services.investigation_service.build_investigation_context"
)
def test_generate_ai_investigation_report(
    mock_context,
    mock_generate,
    client,
):

    test_client, product_id = client

    mock_context.return_value = mock_context_data = (
        globals()["mock_context"](product_id)
    )

    mock_generate.return_value = json.dumps(
        valid_report()
    )

    response = test_client.post(
        f"/api/investigations/products/{product_id}/generate"
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["product_id"] == product_id
    assert data["product_name"] == "Test Cola"
    assert data["status"] == "completed"
    assert data["report"]["report_title"] == (
        "Inventory Investigation Report"
    )

    assert data["id"] > 0

    mock_context.assert_called_once()
    mock_generate.assert_called_once()


def test_retrieve_saved_report(client):

    test_client, product_id = client

    with patch(
        "app.services.investigation_service.generate_response"
    ) as mock_generate, patch(
        "app.services.investigation_service.build_investigation_context"
    ) as mock_context:

        mock_context.return_value = mock_context_data = (
            globals()["mock_context"](product_id)
        )

        mock_generate.return_value = json.dumps(
            valid_report()
        )

        generated = test_client.post(
            f"/api/investigations/products/{product_id}/generate"
        )

        assert generated.status_code == 200

    report_id = generated.json()["id"]

    response = test_client.get(
        f"/api/investigations/reports/{report_id}"
    )

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == report_id
    assert data["product_id"] == product_id
    assert data["report"]["executive_summary"] == (
        valid_report()["executive_summary"]
    )


def test_missing_report_returns_404(client):

    test_client, _ = client

    response = test_client.get(
        "/api/investigations/reports/99999"
    )

    assert response.status_code == 404


def test_list_product_investigation_reports(client):

    test_client, product_id = client

    with patch(
        "app.services.investigation_service.generate_response"
    ) as mock_generate, patch(
        "app.services.investigation_service.build_investigation_context"
    ) as mock_context:

        mock_context.return_value = (
            globals()["mock_context"](product_id)
        )

        mock_generate.return_value = json.dumps(
            valid_report()
        )

        first = test_client.post(
            f"/api/investigations/products/{product_id}/generate"
        )

        second = test_client.post(
            f"/api/investigations/products/{product_id}/generate"
        )

        assert first.status_code == 200
        assert second.status_code == 200

    response = test_client.get(
        f"/api/investigations/products/{product_id}/reports"
    )

    assert response.status_code == 200

    reports = response.json()

    assert len(reports) == 2
    assert reports[0]["id"] == second.json()["id"]


def test_invalid_ai_response_returns_502(client):

    test_client, product_id = client

    with patch(
        "app.services.investigation_service.generate_response"
    ) as mock_generate, patch(
        "app.services.investigation_service.build_investigation_context"
    ) as mock_context:

        mock_context.return_value = (
            globals()["mock_context"](product_id)
        )

        invalid = valid_report()
        invalid["risk_assessment"]["level"] = "extreme"

        mock_generate.return_value = json.dumps(invalid)

        response = test_client.post(
            f"/api/investigations/products/{product_id}/generate"
        )

    assert response.status_code == 502


def test_missing_product_returns_404(client):

    test_client, _ = client

    response = test_client.post(
        "/api/investigations/products/99999/generate"
    )

    assert response.status_code == 404