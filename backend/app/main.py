from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.ai import router as ai_router
from app.api.inventory import router as inventory_router
from app.api.history import router as history_router
from app.api.orders import router as orders_router
from app.api.evidence import router as evidence_router
from app.api.document_analysis import router as document_analysis_router
from app.api.reconciliation import router as reconciliation_router
from app.api.inventory_timeline import router as inventory_timeline_router
from app.api.inventory_movements import router as inventory_movements_router
from app.api.investigations import router as investigations_router
from app.api import products
app = FastAPI(
    title="Hsain Agent API",
    description="AI-powered retail inventory investigation agent",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)
app.include_router(ai_router)
app.include_router(inventory_router)
app.include_router(history_router)
app.include_router(orders_router)
app.include_router(evidence_router)
app.include_router(document_analysis_router)
app.include_router(reconciliation_router)
app.include_router(inventory_timeline_router)
app.include_router(inventory_movements_router)
app.include_router(investigations_router)
app.include_router(products.router)

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "hsain-agent-api",
    }