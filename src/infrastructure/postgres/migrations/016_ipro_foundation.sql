CREATE TABLE IF NOT EXISTS ipro.ingestion_batches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'READY', 'FAILED', 'SUPERSEDED')),
  source_system TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  input_file_count INTEGER NOT NULL DEFAULT 0 CHECK (input_file_count >= 0),
  input_row_count INTEGER NOT NULL DEFAULT 0 CHECK (input_row_count >= 0),
  accepted_row_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_row_count >= 0),
  rejected_row_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_row_count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ipro_ingestion_batches_terminal_timestamp_ck CHECK (
    (status = 'READY' AND completed_at IS NOT NULL AND failed_at IS NULL)
    OR (status = 'FAILED' AND failed_at IS NOT NULL)
    OR (status = 'SUPERSEDED' AND superseded_at IS NOT NULL)
    OR (status = 'PROCESSING' AND completed_at IS NULL AND failed_at IS NULL AND superseded_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS ipro.source_files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id) ON DELETE RESTRICT,
  file_name TEXT NOT NULL,
  file_kind TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'PARSED', 'FAILED', 'DUPLICATE')),
  duplicate_of_source_file_id TEXT REFERENCES ipro.source_files(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_hash)
);

CREATE INDEX IF NOT EXISTS idx_ipro_source_files_batch ON ipro.source_files (batch_id);

CREATE TABLE IF NOT EXISTS ipro.registry_versions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id) ON DELETE RESTRICT,
  source_file_id TEXT NOT NULL REFERENCES ipro.source_files(id) ON DELETE RESTRICT,
  registry_name TEXT NOT NULL,
  registry_kind TEXT NOT NULL,
  version_hash TEXT NOT NULL,
  effective_from DATE,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (registry_name, registry_kind, version_hash)
);

CREATE INDEX IF NOT EXISTS idx_ipro_registry_versions_batch ON ipro.registry_versions (batch_id);

CREATE TABLE IF NOT EXISTS ipro.customer_entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  canonical_document TEXT,
  entity_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (entity_status IN ('ACTIVE', 'INACTIVE', 'MERGED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ipro_customer_entities_canonical_document
  ON ipro.customer_entities (canonical_document)
  WHERE canonical_document IS NOT NULL;

CREATE TABLE IF NOT EXISTS ipro.customer_documents (
  id TEXT PRIMARY KEY,
  customer_entity_id TEXT NOT NULL REFERENCES ipro.customer_entities(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL CHECK (document_type IN ('CNPJ', 'CPF', 'OTHER')),
  document_value TEXT NOT NULL,
  normalized_document TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source_registry_version_id TEXT REFERENCES ipro.registry_versions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_type, normalized_document)
);

CREATE INDEX IF NOT EXISTS idx_ipro_customer_documents_entity ON ipro.customer_documents (customer_entity_id);

CREATE TABLE IF NOT EXISTS ipro.transactions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id) ON DELETE RESTRICT,
  source_file_id TEXT NOT NULL REFERENCES ipro.source_files(id) ON DELETE RESTRICT,
  source_row_number INTEGER CHECK (source_row_number IS NULL OR source_row_number > 0),
  source_row_hash TEXT NOT NULL,
  business_event_hash TEXT NOT NULL,
  customer_entity_id TEXT REFERENCES ipro.customer_entities(id) ON DELETE RESTRICT,
  customer_document_type TEXT CHECK (customer_document_type IN ('CNPJ', 'CPF', 'OTHER')),
  customer_document TEXT,
  customer_name TEXT,
  product_key TEXT NOT NULL,
  product_description TEXT,
  transaction_date DATE NOT NULL,
  quantity NUMERIC(20, 6) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(20, 6) NOT NULL DEFAULT 0,
  net_amount NUMERIC(20, 6) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  resolution_state TEXT NOT NULL CHECK (resolution_state IN ('RESOLVED', 'AMBIGUOUS', 'UNMATCHED')),
  record_status TEXT NOT NULL DEFAULT 'CANONICAL' CHECK (record_status IN ('CANONICAL', 'DUPLICATE', 'SUPERSEDED', 'REJECTED')),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_file_id, source_row_hash),
  UNIQUE (business_event_hash)
);

CREATE INDEX IF NOT EXISTS idx_ipro_transactions_batch ON ipro.transactions (batch_id);
CREATE INDEX IF NOT EXISTS idx_ipro_transactions_customer_product_date
  ON ipro.transactions (customer_entity_id, product_key, transaction_date);
CREATE INDEX IF NOT EXISTS idx_ipro_transactions_resolution_status
  ON ipro.transactions (resolution_state, record_status);

CREATE TABLE IF NOT EXISTS ipro.identity_resolutions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id) ON DELETE RESTRICT,
  transaction_id TEXT REFERENCES ipro.transactions(id) ON DELETE RESTRICT,
  source_document_type TEXT CHECK (source_document_type IN ('CNPJ', 'CPF', 'OTHER')),
  source_document TEXT,
  source_name TEXT,
  resolved_customer_entity_id TEXT REFERENCES ipro.customer_entities(id) ON DELETE RESTRICT,
  resolution_state TEXT NOT NULL CHECK (resolution_state IN ('RESOLVED', 'AMBIGUOUS', 'UNMATCHED')),
  resolution_method TEXT NOT NULL CHECK (resolution_method IN ('DOCUMENT_EXACT', 'LOCAL_OVERRIDE', 'FUZZY_NAME', 'MANUAL_REVIEW', 'NONE')),
  confidence NUMERIC(6, 5) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ipro_identity_resolutions_batch ON ipro.identity_resolutions (batch_id);
CREATE INDEX IF NOT EXISTS idx_ipro_identity_resolutions_state ON ipro.identity_resolutions (resolution_state);

CREATE TABLE IF NOT EXISTS ipro.calculation_runs (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'READY', 'FAILED')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  input_transaction_count INTEGER NOT NULL DEFAULT 0 CHECK (input_transaction_count >= 0),
  metric_count INTEGER NOT NULL DEFAULT 0 CHECK (metric_count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  CONSTRAINT ipro_calculation_runs_period_ck CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_ipro_calculation_runs_batch ON ipro.calculation_runs (batch_id);

CREATE TABLE IF NOT EXISTS ipro.customer_product_metrics (
  id TEXT PRIMARY KEY,
  calculation_run_id TEXT NOT NULL REFERENCES ipro.calculation_runs(id) ON DELETE RESTRICT,
  customer_entity_id TEXT NOT NULL REFERENCES ipro.customer_entities(id) ON DELETE RESTRICT,
  product_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  transaction_count INTEGER NOT NULL DEFAULT 0 CHECK (transaction_count >= 0),
  quantity NUMERIC(20, 6) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(20, 6) NOT NULL DEFAULT 0,
  net_amount NUMERIC(20, 6) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ipro_customer_product_metrics_period_ck CHECK (period_end >= period_start),
  UNIQUE (calculation_run_id, customer_entity_id, product_key, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_ipro_customer_product_metrics_customer_product
  ON ipro.customer_product_metrics (customer_entity_id, product_key, period_start, period_end);

CREATE TABLE IF NOT EXISTS ipro.ingestion_errors (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id) ON DELETE RESTRICT,
  source_file_id TEXT REFERENCES ipro.source_files(id) ON DELETE RESTRICT,
  source_row_number INTEGER CHECK (source_row_number IS NULL OR source_row_number > 0),
  source_row_hash TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('WARNING', 'ERROR')),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ipro_ingestion_errors_batch ON ipro.ingestion_errors (batch_id);
CREATE INDEX IF NOT EXISTS idx_ipro_ingestion_errors_source_file ON ipro.ingestion_errors (source_file_id);

CREATE OR REPLACE VIEW ipro.active_canonical_transactions AS
SELECT t.*
FROM ipro.transactions t
JOIN ipro.ingestion_batches b ON b.id = t.batch_id
WHERE b.status = 'READY'
  AND t.record_status = 'CANONICAL'
  AND t.resolution_state = 'RESOLVED';
