import pytest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    Product,
    StockMovement,
    InventoryMovementProposal,
)
from app.services.inventory_risk import calculate_stock_risk
from app.services.reorder_intelligence import (
    calculate_reorder_recommendation,
)


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()

    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def create_product(db, stock=20):
    product = Product(
        name="Test Cola",
        sku="COLA-001",
        current_stock=stock,
    )

    db.add(product)
    db.flush()

    return product


def create_sale(db, product, quantity, status):
    movement = StockMovement(
        product_id=product.id,
        quantity_delta=-quantity,
        reason="sale",
        notes="Test sale",
        created_at=datetime.now(timezone.utc),
    )

    db.add(movement)
    db.flush()

    proposal = InventoryMovementProposal(
        investigation_id=1,
        evidence_id=1,
        product_id=product.id,
        movement_type="sale",
        quantity=quantity,
        quantity_delta=-quantity,
        reason="Test sale",
        status=status,
        stock_movement_id=movement.id,
    )

    db.add(proposal)
    db.flush()

    return proposal


def test_no_sales_returns_zero_velocity(db_session):
    product = create_product(db_session)

    result = calculate_stock_risk(product, db_session)

    assert result["sales_velocity"]["units_sold"] == 0
    assert result["sales_velocity"]["average_daily_sales"] == 0
    assert result["sales_velocity"]["days_of_cover"] is None


def test_approved_sales_contribute_to_velocity(db_session):
    product = create_product(db_session)

    create_sale(
        db_session,
        product,
        quantity=8,
        status="approved",
    )

    db_session.commit()

    result = calculate_stock_risk(product, db_session)

    assert result["sales_velocity"]["units_sold"] == 8
    assert result["sales_velocity"]["average_daily_sales"] == 0.27
    assert result["sales_velocity"]["days_of_cover"] == 75.0


def test_pending_sales_are_excluded(db_session):
    product = create_product(db_session)

    create_sale(
        db_session,
        product,
        quantity=8,
        status="pending_approval",
    )

    db_session.commit()

    result = calculate_stock_risk(product, db_session)

    assert result["sales_velocity"]["units_sold"] == 0


def test_rejected_sales_are_excluded(db_session):
    product = create_product(db_session)

    create_sale(
        db_session,
        product,
        quantity=8,
        status="rejected",
    )

    db_session.commit()

    result = calculate_stock_risk(product, db_session)

    assert result["sales_velocity"]["units_sold"] == 0


def test_old_sales_are_excluded(db_session):
    product = create_product(db_session)

    movement = StockMovement(
        product_id=product.id,
        quantity_delta=-8,
        reason="sale",
        notes="Old sale",
        created_at=datetime.now(timezone.utc) - timedelta(days=45),
    )

    db_session.add(movement)
    db_session.flush()

    proposal = InventoryMovementProposal(
        investigation_id=1,
        evidence_id=1,
        product_id=product.id,
        movement_type="sale",
        quantity=8,
        quantity_delta=-8,
        reason="Old sale",
        status="approved",
        stock_movement_id=movement.id,
    )

    db_session.add(proposal)
    db_session.commit()

    result = calculate_stock_risk(product, db_session)

    assert result["sales_velocity"]["units_sold"] == 0


def test_reorder_recommendation_uses_verified_sales(db_session):
    product = create_product(db_session, stock=12)

    create_sale(
        db_session,
        product,
        quantity=8,
        status="approved",
    )

    db_session.commit()

    result = calculate_reorder_recommendation(
        product=product,
        db=db_session,
        lead_time_days=7,
        safety_buffer_days=3,
        target_cover_days=30,
    )

    assert result["sales"]["units_sold"] == 8
    assert result["sales"]["average_daily_sales"] == 0.27
    assert result["reorder_calculation"]["calculated_reorder_point"] == 3
    
def test_product_lead_time_overrides_api_default(db_session):
    product = create_product(db_session, stock=100)

    product.lead_time_days = 5
    product.safety_buffer_days = 2

    create_sale(
        db_session,
        product,
        quantity=30,
        status="approved",
    )

    db_session.commit()

    result = calculate_reorder_recommendation(
        product=product,
        db=db_session,
        lead_time_days=10,
        safety_buffer_days=5,
    )

    calculation = result["reorder_calculation"]

    assert calculation["lead_time_days"] == 5
    assert calculation["safety_buffer_days"] == 2

    assert calculation["lead_time_source"] == "product_configuration"
    assert calculation["safety_buffer_source"] == "product_configuration"

    assert calculation["calculated_reorder_point"] == 7


def test_api_defaults_are_used_when_product_settings_are_missing(db_session):
    product = create_product(db_session, stock=100)

    create_sale(
        db_session,
        product,
        quantity=30,
        status="approved",
    )

    db_session.commit()

    result = calculate_reorder_recommendation(
        product=product,
        db=db_session,
        lead_time_days=8,
        safety_buffer_days=4,
    )

    calculation = result["reorder_calculation"]

    assert calculation["lead_time_days"] == 8
    assert calculation["safety_buffer_days"] == 4

    assert calculation["lead_time_source"] == "api_default"
    assert calculation["safety_buffer_source"] == "api_default"

    assert calculation["calculated_reorder_point"] == 12


def test_zero_day_product_configuration_is_respected(db_session):
    product = create_product(db_session, stock=100)

    product.lead_time_days = 0
    product.safety_buffer_days = 0

    create_sale(
        db_session,
        product,
        quantity=30,
        status="approved",
    )

    db_session.commit()

    result = calculate_reorder_recommendation(
        product=product,
        db=db_session,
        lead_time_days=10,
        safety_buffer_days=5,
    )

    calculation = result["reorder_calculation"]

    assert calculation["lead_time_days"] == 0
    assert calculation["safety_buffer_days"] == 0
    assert calculation["calculated_reorder_point"] == 0


def test_configured_reorder_point_overrides_calculated_value(db_session):
    product = create_product(db_session, stock=15)

    product.reorder_point = 20
    product.lead_time_days = 5
    product.safety_buffer_days = 2

    create_sale(
        db_session,
        product,
        quantity=30,
        status="approved",
    )

    db_session.commit()

    result = calculate_reorder_recommendation(
        product=product,
        db=db_session,
    )

    calculation = result["reorder_calculation"]

    assert calculation["configured_reorder_point"] == 20
    assert calculation["calculated_reorder_point"] == 7
    assert calculation["effective_reorder_point"] == 20
    assert calculation["reorder_point_source"] == "configured"

    assert result["decision"]["reorder_required"] is True


def test_reorder_calculation_does_not_modify_inventory(db_session):
    product = create_product(db_session, stock=42)

    product.lead_time_days = 5
    product.safety_buffer_days = 2
    product.reorder_point = 50

    original_stock = product.current_stock

    result = calculate_reorder_recommendation(
        product=product,
        db=db_session,
    )

    assert product.current_stock == original_stock
    assert result["current_stock"] == original_stock
    assert result["inventory_modified"] is False
    assert result["automatically_ordered"] is False
    assert result["requires_human_approval"] is True
    
def test_data_confidence_is_low_without_opening_balance_or_sales(
    db_session,
):
    product = create_product(db_session)

    result = calculate_stock_risk(product, db_session)

    assert result["data_confidence"] == "low"

    assert result["data_quality"]["opening_balance_available"] is False
    assert result["data_quality"]["verified_sales_available"] is False


def test_data_confidence_is_medium_with_opening_balance_only(
    db_session,
):
    from app.models import StockOpeningBalance

    product = create_product(db_session)

    opening_balance = StockOpeningBalance(
        product_id=product.id,
        opening_quantity=20,
        source="physical_count",
        recorded_by="test",
    )

    db_session.add(opening_balance)
    db_session.commit()

    result = calculate_stock_risk(product, db_session)

    assert result["data_confidence"] == "medium"


def test_data_confidence_is_medium_with_sales_only(
    db_session,
):
    product = create_product(db_session)

    create_sale(
        db_session,
        product,
        quantity=8,
        status="approved",
    )

    db_session.commit()

    result = calculate_stock_risk(product, db_session)

    assert result["data_confidence"] == "medium"


def test_sales_confidence_is_high_with_both_data_sources(
    db_session,
):
    from app.models import StockOpeningBalance

    product = create_product(db_session)

    create_sale(
        db_session,
        product,
        quantity=8,
        status="approved",
    )

    opening_balance = StockOpeningBalance(
        product_id=product.id,
        opening_quantity=20,
        source="physical_count",
        recorded_by="test",
    )

    db_session.add(opening_balance)
    db_session.commit()

    result = calculate_stock_risk(product, db_session)

    assert result["data_confidence"] == "high"


def test_no_sales_does_not_invent_sales_based_order_quantity(
    db_session,
):
    product = create_product(db_session, stock=0)

    result = calculate_reorder_recommendation(
        product=product,
        db=db_session,
    )

    assert result["decision"]["reorder_required"] is True
    assert result["decision"]["urgency"] == "critical"
    assert result["decision"]["recommended_quantity"] is None
    assert result["decision"]["quantity_source"] == "insufficient_data"
    assert result["inventory_modified"] is False