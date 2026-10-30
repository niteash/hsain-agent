from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import Product

router = APIRouter(
    prefix="/api/products",
    tags=["Products"],
)


@router.get("/")
def get_products(db: Session = Depends(get_db)):
    products = (
        db.query(Product)
        .order_by(Product.name.asc())
        .all()
    )

    return [
        {
            "id": product.id,
            "name": product.name,
            "sku": product.sku,
            "current_stock": product.current_stock,
        }
        for product in products
    ]


@router.get("/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):
    from fastapi import HTTPException

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    return {
        "id": product.id,
        "name": product.name,
        "sku": product.sku,
        "current_stock": product.current_stock,
    }