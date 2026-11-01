from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import Product, Supplier
from app.schemas.product import (
    ProductCreate,
    ProductUpdate,
    ProductResponse,
)

router = APIRouter(
    prefix="/api/products",
    tags=["Products"],
)


# ============================================================
# VALIDATION HELPERS
# ============================================================

def validate_stock_thresholds(
    minimum_stock: int | None,
    reorder_point: int | None,
    maximum_stock: int | None,
) -> None:
    if (
        minimum_stock is not None
        and reorder_point is not None
        and minimum_stock > reorder_point
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Minimum stock cannot exceed the reorder point.",
        )

    if (
        reorder_point is not None
        and maximum_stock is not None
        and reorder_point > maximum_stock
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Reorder point cannot exceed maximum stock.",
        )

    if (
        minimum_stock is not None
        and maximum_stock is not None
        and minimum_stock > maximum_stock
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Minimum stock cannot exceed maximum stock.",
        )


def validate_preferred_supplier(
    supplier_id: int | None,
    db: Session,
) -> None:
    if supplier_id is None:
        return

    supplier = db.get(Supplier, supplier_id)

    if supplier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preferred supplier not found.",
        )

    if not supplier.is_active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot assign an inactive supplier.",
        )


def validate_product_identity(
    name: str | None,
    sku: str | None,
    db: Session,
    exclude_product_id: int | None = None,
) -> None:
    if name is not None:
        query = db.query(Product).filter(
            Product.name == name,
        )

        if exclude_product_id is not None:
            query = query.filter(
                Product.id != exclude_product_id,
            )

        if query.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A product with this name already exists.",
            )

    if sku:
        query = db.query(Product).filter(
            Product.sku == sku,
        )

        if exclude_product_id is not None:
            query = query.filter(
                Product.id != exclude_product_id,
            )

        if query.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A product with this SKU already exists.",
            )


def get_product_with_supplier(
    product_id: int,
    db: Session,
) -> Product | None:
    return (
        db.query(Product)
        .options(selectinload(Product.preferred_supplier))
        .filter(Product.id == product_id)
        .first()
    )


# ============================================================
# LIST PRODUCTS
# ============================================================

@router.get(
    "/",
    response_model=list[ProductResponse],
)
def get_products(
    q: str | None = Query(default=None, max_length=120),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Product).options(
        selectinload(Product.preferred_supplier)
    )

    if q and q.strip():
        search_term = f"%{q.strip()}%"

        query = query.filter(
            or_(
                Product.name.ilike(search_term),
                Product.sku.ilike(search_term),
            )
        )

    return (
        query
        .order_by(Product.name.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ============================================================
# GET PRODUCT DETAILS
# ============================================================

@router.get(
    "/{product_id}",
    response_model=ProductResponse,
)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = get_product_with_supplier(
        product_id=product_id,
        db=db,
    )

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    return product


# ============================================================
# CREATE PRODUCT
# ============================================================

@router.post(
    "/",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
):
    validate_product_identity(
        name=payload.name,
        sku=payload.sku,
        db=db,
    )

    validate_stock_thresholds(
        minimum_stock=payload.minimum_stock,
        reorder_point=payload.reorder_point,
        maximum_stock=payload.maximum_stock,
    )

    validate_preferred_supplier(
        supplier_id=payload.preferred_supplier_id,
        db=db,
    )

    product_data = payload.model_dump()

    # Inventory is initialized independently of product configuration.
    product = Product(
        **product_data,
        current_stock=0,
    )

    try:
        db.add(product)
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A product with this name or SKU already exists.",
        )

    created_product = get_product_with_supplier(
        product_id=product.id,
        db=db,
    )

    if created_product is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Product was created but could not be retrieved.",
        )

    return created_product


# ============================================================
# UPDATE PRODUCT
# ============================================================

@router.patch(
    "/{product_id}",
    response_model=ProductResponse,
)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    update_data = payload.model_dump(
        exclude_unset=True,
    )

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided for update.",
        )

    # Product identity validation.
    validate_product_identity(
        name=update_data.get("name"),
        sku=update_data.get("sku"),
        db=db,
        exclude_product_id=product_id,
    )

    # Validate the resulting stock thresholds, not only the
    # individual fields included in the request.
    resulting_values = {
        "minimum_stock": product.minimum_stock,
        "reorder_point": product.reorder_point,
        "maximum_stock": product.maximum_stock,
    }

    for field in resulting_values:
        if field in update_data:
            resulting_values[field] = update_data[field]

    validate_stock_thresholds(
        minimum_stock=resulting_values["minimum_stock"],
        reorder_point=resulting_values["reorder_point"],
        maximum_stock=resulting_values["maximum_stock"],
    )

    # Validate preferred supplier only when the field is provided.
    if "preferred_supplier_id" in update_data:
        validate_preferred_supplier(
            supplier_id=update_data["preferred_supplier_id"],
            db=db,
        )

    # Critical inventory protection:
    # Product configuration updates must never modify current_stock.
    update_data.pop("current_stock", None)

    for field, value in update_data.items():
        setattr(product, field, value)

    try:
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to update product. Check for duplicate product names or SKUs.",
        )

    updated_product = get_product_with_supplier(
        product_id=product_id,
        db=db,
    )

    if updated_product is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Product was updated but could not be retrieved.",
        )

    return updated_product