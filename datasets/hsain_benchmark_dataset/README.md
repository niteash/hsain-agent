# Hsain Agent synthetic benchmark dataset
All records are fabricated test data; no real suppliers or transactions are represented.

## Scale
100 suppliers; 10,000 products; 10,000 opening balances; 100,000 stock movements;
5,000 investigations; 10,000 evidence files; 10,000 extractions; 10,000 analyses;
approximately 7,000 reconciliations; 10,000 movement proposals; 5,000 supplier orders.

## Relationship map
products.preferred_supplier_id -> suppliers.id
stock_opening_balances.product_id, stock_movements.product_id, investigations.product_id -> products.id
evidence_files.investigation_id -> investigations.id
evidence_extractions.evidence_id, evidence_analyses.evidence_id -> evidence_files.id
evidence_reconciliations.evidence_id -> evidence_files.id; investigation_id -> investigations.id
inventory_movement_proposals.investigation_id -> investigations.id; evidence_id -> evidence_files.id; product_id -> products.id
supplier_orders.investigation_id -> investigations.id; supplier_id -> suppliers.id; product_id -> products.id

## Important import warning
CSV columns and enum/status values are a benchmark starting point, NOT guaranteed drop-in SQLAlchemy seed data.
Check your actual model definitions, required fields, foreign keys, defaults, and enum constraints before importing.
Import only into a disposable/staging database, in parent-to-child order. Never import directly into production.
`simulated_ordered` is only a simulated proposal state, not proof of dispatch, delivery, or receipt, and must never mutate stock.

## Suggested tests
- Inventory risk and reorder queries across 10k products.
- Latest movement queries over 100k movements.
- Evidence ranking and bounded retrieval for investigations.
- Query plans/index effectiveness and concurrent read-heavy requests.
- Context-size estimation. Do not send the whole dataset to an LLM.
