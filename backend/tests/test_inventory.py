from app.services.inventory import calculate_discrepancy


def test_shortage_calculation():
    result = calculate_discrepancy(
        expected_stock=24,
        physical_stock=17,
        units_sold=4,
    )

    assert result["expected_remaining_stock"] == 20
    assert result["discrepancy"] == -3
    assert result["status"] == "shortage"


def test_matching_stock():
    result = calculate_discrepancy(
        expected_stock=24,
        physical_stock=20,
        units_sold=4,
    )

    assert result["expected_remaining_stock"] == 20
    assert result["discrepancy"] == 0
    assert result["status"] == "matched"


def test_surplus_stock():
    result = calculate_discrepancy(
        expected_stock=24,
        physical_stock=22,
        units_sold=4,
    )

    assert result["expected_remaining_stock"] == 20
    assert result["discrepancy"] == 2
    assert result["status"] == "surplus"


def test_zero_stock():
    result = calculate_discrepancy(
        expected_stock=10,
        physical_stock=0,
        units_sold=10,
    )

    assert result["expected_remaining_stock"] == 0
    assert result["discrepancy"] == 0
    assert result["status"] == "matched"
