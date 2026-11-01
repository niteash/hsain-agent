from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import Supplier
from app.schemas.supplier import (
    SupplierCreate,
    SupplierUpdate,
    SupplierResponse,
)

router = APIRouter(
    prefix="/api/suppliers",
    tags=["Suppliers"],
)


@router.get("/", response_model=list[SupplierResponse])
def get_suppliers(
    q: str | None = Query(default=None, max_length=150),
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    query = db.query(Supplier)

    if active_only:
        query = query.filter(Supplier.is_active.is_(True))

    if q and q.strip():
        query = query.filter(
            Supplier.name.ilike(f"%{q.strip()}%")
        )

    return query.order_by(Supplier.name.asc()).all()


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
):
    supplier = db.get(Supplier, supplier_id)

    if not supplier:
        raise HTTPException(
            status_code=404,
            detail="Supplier not found.",
        )

    return supplier


@router.post(
    "/",
    response_model=SupplierResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
):
    existing = db.query(Supplier).filter(
        Supplier.name == payload.name
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="A supplier with this name already exists.",
        )

    supplier = Supplier(**payload.model_dump())

    try:
        db.add(supplier)
        db.commit()
        db.refresh(supplier)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A supplier with this name already exists.",
        )

    return supplier


@router.patch("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
):
    supplier = db.get(Supplier, supplier_id)

    if not supplier:
        raise HTTPException(
            status_code=404,
            detail="Supplier not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No fields provided for update.",
        )

    if update_data.get("name") is not None:
        existing = db.query(Supplier).filter(
            Supplier.name == update_data["name"],
            Supplier.id != supplier_id,
        ).first()

        if existing:
            raise HTTPException(
                status_code=409,
                detail="Another supplier already uses this name.",
            )

    for field, value in update_data.items():
        setattr(supplier, field, value)

    try:
        db.commit()
        db.refresh(supplier)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Unable to update supplier.",
        )

    return supplier