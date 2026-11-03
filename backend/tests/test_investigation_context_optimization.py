from datetime import datetime, timedelta, timezone

import pytest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base

from app.models import (
    Product,
    Investigation,
    EvidenceFile,
    EvidenceAnalysis,
    EvidenceReconciliation,
)

from app.services.investigation_context import (
    get_evidence_for_investigations,
    estimate_context_size,
    MAX_EVIDENCE_PER_INVESTIGATION,
    MAX_RECONCILIATIONS_PER_EVIDENCE,
)


# ============================================================
# TEST DATABASE FIXTURE
# ============================================================

@pytest.fixture
def db_session():

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

    db = TestingSessionLocal()

    try:
        yield db

    finally:
        db.close()

        Base.metadata.drop_all(
            bind=test_engine,
        )

        test_engine.dispose()


# ============================================================
# TEST HELPERS
# ============================================================

def create_test_product(db, name="Context Test Product"):

    product = Product(
        name=name,
        current_stock=10,
    )

    db.add(product)
    db.flush()

    return product


def create_test_investigation(
    db,
    product_id,
    status="open",
):

    investigation = Investigation(
        product_id=product_id,
        expected_stock=10,
        physical_stock=8,
        units_sold=0,
        expected_remaining_stock=10,
        discrepancy=-2,
        status=status,
        investigation="Test investigation",
        recommended_action="Review inventory",
        evidence_notes="Test evidence",
    )

    db.add(investigation)
    db.flush()

    return investigation


def create_test_evidence(
    db,
    investigation_id,
    filename,
    created_at,
    is_relevant=False,
):

    evidence = EvidenceFile(
        investigation_id=investigation_id,
        original_filename=filename,
        stored_filename=filename,
        content_type="application/pdf",
        file_size=1024,
        storage_path=f"/tmp/{filename}",
        created_at=created_at,
    )

    db.add(evidence)
    db.flush()

    analysis = EvidenceAnalysis(
        evidence_id=evidence.id,
        document_type="invoice",
        is_inventory_relevant=is_relevant,
        analysis_json="{}",
        model="test-model",
    )

    db.add(analysis)
    db.flush()

    return evidence


# ============================================================
# EVIDENCE RETRIEVAL LIMIT TEST
# ============================================================

def test_evidence_retrieval_is_bounded_and_relevance_ranked(
    db_session,
):

    db = db_session

    product = create_test_product(db)

    investigation = create_test_investigation(
        db,
        product.id,
    )

    now = datetime.now(timezone.utc)

    evidence_records = []

    # Create more evidence than the configured limit.
    for index in range(
        MAX_EVIDENCE_PER_INVESTIGATION + 5
    ):

        evidence = create_test_evidence(
            db=db,
            investigation_id=investigation.id,
            filename=f"evidence-{index}.pdf",
            created_at=now + timedelta(seconds=index),
            is_relevant=False,
        )

        evidence_records.append(evidence)

    # Make the oldest evidence inventory-relevant.
    relevant_evidence = evidence_records[0]

    relevant_analysis = db.query(
        EvidenceAnalysis
    ).filter(
        EvidenceAnalysis.evidence_id
        == relevant_evidence.id
    ).first()

    relevant_analysis.is_inventory_relevant = True

    db.flush()

    result, metadata = get_evidence_for_investigations(
        db,
        [investigation.id],
    )

    selected = result[investigation.id]

    assert len(selected) == MAX_EVIDENCE_PER_INVESTIGATION

    assert metadata["total"] == len(evidence_records)

    assert metadata["included"] == MAX_EVIDENCE_PER_INVESTIGATION

    assert metadata["excluded"] == 5

    # Inventory-relevant evidence must rank before newer
    # evidence that is not marked inventory-relevant.
    assert selected[0]["evidence_id"] == relevant_evidence.id

    assert metadata["selection_strategy"] == "relevance_ranked"

    assert selected[0]["evidence_metadata"]["relevance_ranked"] is True


# ============================================================
# RECONCILIATION RETRIEVAL LIMIT TEST
# ============================================================

def test_reconciliation_retrieval_is_bounded(
    db_session,
):

    db = db_session

    product = create_test_product(
        db,
        name="Reconciliation Test Product",
    )

    investigation = create_test_investigation(
        db,
        product.id,
        status="completed",
    )

    evidence = create_test_evidence(
        db=db,
        investigation_id=investigation.id,
        filename="reconciliation-test.pdf",
        created_at=datetime.now(timezone.utc),
        is_relevant=True,
    )

    now = datetime.now(timezone.utc)

    # Create more reconciliation records than the configured limit.
    for index in range(
        MAX_RECONCILIATIONS_PER_EVIDENCE + 3
    ):

        db.add(
            EvidenceReconciliation(
                evidence_id=evidence.id,
                investigation_id=investigation.id,
                status="completed",
                result_json='{"index": %d}' % index,
                created_at=now + timedelta(seconds=index),
            )
        )

    db.flush()

    result, metadata = get_evidence_for_investigations(
        db,
        [investigation.id],
    )

    selected = result[investigation.id][0]

    assert (
        len(selected["reconciliations"])
        == MAX_RECONCILIATIONS_PER_EVIDENCE
    )

    assert (
        selected["evidence_metadata"]["total_reconciliations"]
        == MAX_RECONCILIATIONS_PER_EVIDENCE + 3
    )

    assert (
        selected["evidence_metadata"]["included_reconciliations"]
        == MAX_RECONCILIATIONS_PER_EVIDENCE
    )

    assert (
        selected["evidence_metadata"]["excluded_reconciliations"]
        == 3
    )


# ============================================================
# EMPTY INVESTIGATION TEST
# ============================================================

def test_evidence_retrieval_handles_empty_investigation_list(
    db_session,
):

    result, metadata = get_evidence_for_investigations(
        db_session,
        [],
    )

    assert result == {}

    assert metadata["total"] == 0

    assert metadata["included"] == 0

    assert metadata["excluded"] == 0

    assert metadata["selection_strategy"] == "relevance_ranked"


# ============================================================
# EVIDENCE PROVENANCE TEST
# ============================================================

def test_evidence_retrieval_preserves_provenance(
    db_session,
):

    db = db_session

    product = create_test_product(
        db,
        name="Provenance Test Product",
    )

    investigation = create_test_investigation(
        db,
        product.id,
    )

    evidence = create_test_evidence(
        db=db,
        investigation_id=investigation.id,
        filename="provenance-test.pdf",
        created_at=datetime.now(timezone.utc),
        is_relevant=True,
    )

    db.add(
        EvidenceReconciliation(
            evidence_id=evidence.id,
            investigation_id=investigation.id,
            status="completed",
            result_json='{"matched": true}',
            created_at=datetime.now(timezone.utc),
        )
    )

    db.flush()

    result, _ = get_evidence_for_investigations(
        db,
        [investigation.id],
    )

    selected = result[investigation.id][0]

    assert selected["evidence_id"] == evidence.id

    assert selected["analysis"]["analysis_id"] is not None

    assert selected["analysis"]["is_inventory_relevant"] is True

    assert len(selected["reconciliations"]) == 1

    assert (
        selected["reconciliations"][0]["reconciliation_id"]
        is not None
    )


# ============================================================
# CONTEXT SIZE ESTIMATION TEST
# ============================================================

def test_context_size_estimation():

    context = {
        "product": {
            "name": "Test Product",
        },

        "evidence": [
            {
                "filename": "invoice.pdf",
                "text": "Sample inventory evidence",
            }
        ],
    }

    result = estimate_context_size(context)

    assert result["serialized_characters"] > 0

    assert result["estimated_tokens"] > 0

    assert (
        result["estimation_method"]
        == "characters_divided_by_four"
    )

    assert result["is_exact_token_count"] is False


# ============================================================
# CONTEXT SIZE ESTIMATION WITH UNICODE TEST
# ============================================================

def test_context_size_estimation_supports_burmese():

    context = {
        "product": {
            "name": "မြန်မာကုန်ပစ္စည်း",
        },
    }

    result = estimate_context_size(context)

    assert result["serialized_characters"] > 0

    assert result["estimated_tokens"] > 0

    assert result["is_exact_token_count"] is False