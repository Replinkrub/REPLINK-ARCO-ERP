ALTER TABLE ipro.ingestion_batches
  ADD COLUMN IF NOT EXISTS data_scope TEXT NOT NULL DEFAULT 'controlled_pilot';

ALTER TABLE ipro.ingestion_batches
  ADD COLUMN IF NOT EXISTS load_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ipro_ingestion_batches_data_scope_ck'
  ) THEN
    ALTER TABLE ipro.ingestion_batches
      ADD CONSTRAINT ipro_ingestion_batches_data_scope_ck
      CHECK (data_scope IN ('synthetic_test', 'controlled_pilot', 'operational', 'historical_backfill'));
  END IF;
END $$;

UPDATE ipro.ingestion_batches
SET data_scope = 'synthetic_test',
    metadata = metadata || jsonb_build_object('data_scope_marked_by', '017_ipro_canonical_product_gate')
WHERE data_scope <> 'synthetic_test'
  AND (
    source_system = 'arco_controlled_pilot'
    OR metadata->>'source' = 'controlled_pilot'
    OR metadata->>'data_scope' = 'synthetic_test'
  );

CREATE TABLE IF NOT EXISTS ipro.product_entities (
  id TEXT PRIMARY KEY,
  canonical_key TEXT NOT NULL UNIQUE,
  sku TEXT,
  product_code TEXT,
  represented_company TEXT,
  normalized_description TEXT NOT NULL,
  category TEXT,
  received_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ipro_product_entities_sku_represented
  ON ipro.product_entities (sku, COALESCE(represented_company, ''))
  WHERE sku IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ipro_product_entities_code_represented
  ON ipro.product_entities (product_code, COALESCE(represented_company, ''))
  WHERE product_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS ipro.product_aliases (
  id TEXT PRIMARY KEY,
  product_entity_id TEXT NOT NULL REFERENCES ipro.product_entities(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL,
  alias_type TEXT NOT NULL CHECK (alias_type IN ('sku', 'code', 'normalized_text', 'safe_hash')),
  normalized_value TEXT,
  safe_hash TEXT,
  origin TEXT,
  valid_from DATE,
  valid_until DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ipro_product_aliases_value_ck CHECK (normalized_value IS NOT NULL OR safe_hash IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ipro_product_aliases_lookup
  ON ipro.product_aliases (source_type, alias_type, COALESCE(normalized_value, ''), COALESCE(safe_hash, ''));

CREATE TABLE IF NOT EXISTS ipro.product_resolutions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id) ON DELETE RESTRICT,
  transaction_id TEXT REFERENCES ipro.transactions(id) ON DELETE RESTRICT,
  source_product_key TEXT,
  source_product_description TEXT,
  represented_company TEXT,
  resolved_product_entity_id TEXT REFERENCES ipro.product_entities(id) ON DELETE RESTRICT,
  resolution_state TEXT NOT NULL CHECK (resolution_state IN ('RESOLVED', 'AMBIGUOUS', 'UNMATCHED')),
  resolution_method TEXT NOT NULL CHECK (resolution_method IN ('exact_sku', 'exact_code', 'exact_alias', 'unique_normalized_text', 'ambiguous', 'unmatched')),
  confidence NUMERIC(6, 5) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ipro_product_resolutions_batch ON ipro.product_resolutions (batch_id);
CREATE INDEX IF NOT EXISTS idx_ipro_product_resolutions_state ON ipro.product_resolutions (resolution_state);

ALTER TABLE ipro.transactions
  ADD COLUMN IF NOT EXISTS product_entity_id TEXT REFERENCES ipro.product_entities(id) ON DELETE RESTRICT;

ALTER TABLE ipro.transactions
  ADD COLUMN IF NOT EXISTS product_resolution_state TEXT NOT NULL DEFAULT 'UNMATCHED';

ALTER TABLE ipro.transactions
  ADD COLUMN IF NOT EXISTS product_resolution_method TEXT NOT NULL DEFAULT 'unmatched';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ipro_transactions_product_resolution_state_ck'
  ) THEN
    ALTER TABLE ipro.transactions
      ADD CONSTRAINT ipro_transactions_product_resolution_state_ck
      CHECK (product_resolution_state IN ('RESOLVED', 'AMBIGUOUS', 'UNMATCHED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ipro_transactions_product_resolution_method_ck'
  ) THEN
    ALTER TABLE ipro.transactions
      ADD CONSTRAINT ipro_transactions_product_resolution_method_ck
      CHECK (product_resolution_method IN ('exact_sku', 'exact_code', 'exact_alias', 'unique_normalized_text', 'ambiguous', 'unmatched'));
  END IF;
END $$;

ALTER TABLE ipro.customer_product_metrics
  ADD COLUMN IF NOT EXISTS product_entity_id TEXT REFERENCES ipro.product_entities(id) ON DELETE RESTRICT;

ALTER TABLE ipro.customer_product_metrics
  ADD COLUMN IF NOT EXISTS order_count INTEGER NOT NULL DEFAULT 0 CHECK (order_count >= 0);

ALTER TABLE ipro.customer_product_metrics
  ADD COLUMN IF NOT EXISTS first_purchase_date DATE;

ALTER TABLE ipro.customer_product_metrics
  ADD COLUMN IF NOT EXISTS last_purchase_date DATE;

ALTER TABLE ipro.customer_product_metrics
  ADD COLUMN IF NOT EXISTS recurrence_interval_days INTEGER;

ALTER TABLE ipro.customer_product_metrics
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(6, 5) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

ALTER TABLE ipro.customer_product_metrics
  ADD COLUMN IF NOT EXISTS calculation_version TEXT NOT NULL DEFAULT 'ipro.customer_product_metrics.v1';

CREATE OR REPLACE VIEW ipro.active_canonical_transactions AS
SELECT t.*
FROM ipro.transactions t
JOIN ipro.ingestion_batches b ON b.id = t.batch_id
JOIN ipro.source_files sf ON sf.id = t.source_file_id
WHERE b.status = 'READY'
  AND b.data_scope <> 'synthetic_test'
  AND t.record_status = 'CANONICAL'
  AND t.resolution_state = 'RESOLVED'
  AND t.customer_entity_id IS NOT NULL
  AND t.product_resolution_state = 'RESOLVED'
  AND t.product_entity_id IS NOT NULL
  AND sf.status IN ('PARSED', 'RECEIVED');
