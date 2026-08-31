-- Structural contract only. Approved reconciliation tooling may append evidence,
-- runs, and events and may then repair a transaction in place. This migration
-- performs no customer or transaction data correction and no fact backfill.

CREATE TABLE IF NOT EXISTS ipro.identity_reconciliation_runs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE
    CONSTRAINT ipro_identity_reconciliation_runs_idempotency_key_ck CHECK (
      idempotency_key = BTRIM(idempotency_key) AND idempotency_key <> ''
    ),
  plan_hash TEXT NOT NULL UNIQUE
    CONSTRAINT ipro_identity_reconciliation_runs_plan_hash_ck CHECK (
      plan_hash ~ '^[0-9a-f]{64}$'
    ),
  evidence_manifest_hash TEXT NOT NULL
    CONSTRAINT ipro_identity_reconciliation_runs_evidence_manifest_hash_ck CHECK (
      evidence_manifest_hash ~ '^[0-9a-f]{64}$'
    ),
  actor TEXT NOT NULL
    CONSTRAINT ipro_identity_reconciliation_runs_actor_ck CHECK (
      actor = BTRIM(actor) AND actor <> '' AND char_length(actor) <= 256
    ),
  mode TEXT NOT NULL
    CONSTRAINT ipro_identity_reconciliation_runs_mode_ck CHECK (mode = 'APPLY'),
  scope JSONB NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT ipro_identity_reconciliation_runs_scope_ck CHECK (jsonb_typeof(scope) = 'object'),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT ipro_identity_reconciliation_runs_summary_ck CHECK (jsonb_typeof(summary) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ipro.order_document_evidence (
  id TEXT PRIMARY KEY,
  evidence_hash TEXT NOT NULL UNIQUE
    CONSTRAINT ipro_order_document_evidence_hash_ck CHECK (
      evidence_hash ~ '^[0-9a-f]{64}$'
    ),
  order_key TEXT NOT NULL
    CONSTRAINT ipro_order_document_evidence_order_key_ck CHECK (
      order_key = BTRIM(order_key) AND order_key <> ''
    ),
  document_type TEXT NOT NULL
    CONSTRAINT ipro_order_document_evidence_document_type_ck CHECK (
      document_type IN ('CPF', 'CNPJ')
    ),
  normalized_document TEXT NOT NULL,
  source_content_hash TEXT NOT NULL
    CONSTRAINT ipro_order_document_evidence_source_hash_ck CHECK (
      source_content_hash ~ '^[0-9a-f]{64}$'
    ),
  source_row_number INTEGER
    CONSTRAINT ipro_order_document_evidence_source_row_ck CHECK (
      source_row_number IS NULL OR source_row_number > 0
    ),
  source_kind TEXT NOT NULL
    CONSTRAINT ipro_order_document_evidence_source_kind_ck CHECK (
      source_kind = 'SOURCE_ORDER_DOCUMENT'
    ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT ipro_order_document_evidence_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_ipro_order_document_evidence_id_hash UNIQUE (id, evidence_hash),
  CONSTRAINT ipro_order_document_evidence_document_shape_ck CHECK (
    (
      document_type = 'CPF'
      AND normalized_document ~ '^[0-9]{11}$'
      AND normalized_document !~ '^([0-9])\1{10}$'
    )
    OR
    (
      document_type = 'CNPJ'
      AND normalized_document ~ '^[0-9]{14}$'
      AND normalized_document !~ '^([0-9])\1{13}$'
    )
  )
);

-- Deliberately non-unique: conflicting documents for an order are retained as
-- distinct immutable evidence and can be detected by grouping on order_key.
CREATE INDEX IF NOT EXISTS idx_ipro_order_document_evidence_order_key
  ON ipro.order_document_evidence (order_key);

CREATE TABLE IF NOT EXISTS ipro.identity_reconciliation_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ipro.identity_reconciliation_runs(id) ON DELETE RESTRICT,
  action TEXT NOT NULL
    CONSTRAINT ipro_identity_reconciliation_events_action_ck CHECK (action IN (
      'TRANSACTION_IDENTITY_RECONCILED', 'CUSTOMER_DOCUMENT_TYPE_CORRECTED'
    )),
  transaction_id TEXT REFERENCES ipro.transactions(id) ON DELETE RESTRICT,
  customer_document_id TEXT REFERENCES ipro.customer_documents(id) ON DELETE RESTRICT,
  evidence_id TEXT,
  prior_customer_entity_id TEXT REFERENCES ipro.customer_entities(id) ON DELETE RESTRICT,
  new_customer_entity_id TEXT REFERENCES ipro.customer_entities(id) ON DELETE RESTRICT,
  prior_resolution_state TEXT
    CONSTRAINT ipro_identity_reconciliation_events_prior_state_ck CHECK (
      prior_resolution_state IS NULL
      OR prior_resolution_state IN ('RESOLVED', 'AMBIGUOUS', 'UNMATCHED')
    ),
  new_resolution_state TEXT
    CONSTRAINT ipro_identity_reconciliation_events_new_state_ck CHECK (
      new_resolution_state IS NULL
      OR new_resolution_state IN ('RESOLVED', 'AMBIGUOUS', 'UNMATCHED')
    ),
  prior_document_type TEXT
    CONSTRAINT ipro_identity_reconciliation_events_prior_document_type_ck CHECK (
      prior_document_type IS NULL OR prior_document_type IN ('CPF', 'CNPJ', 'OTHER')
    ),
  new_document_type TEXT
    CONSTRAINT ipro_identity_reconciliation_events_new_document_type_ck CHECK (
      new_document_type IS NULL OR new_document_type IN ('CPF', 'CNPJ')
    ),
  prior_document TEXT,
  new_document TEXT,
  preserved_event_identity_hash TEXT,
  preserved_material_content_hash TEXT,
  evidence_kind TEXT NOT NULL
    CONSTRAINT ipro_identity_reconciliation_events_evidence_kind_ck CHECK (
      evidence_kind IN (
        'DIRECT_DOCUMENT',
        'SOURCE_ORDER_DOCUMENT',
        'STABLE_REGISTRY_DOCUMENT',
        'DOCUMENT_TYPE_SHAPE_CORRECTION'
      )
    ),
  evidence_hash TEXT NOT NULL
    CONSTRAINT ipro_identity_reconciliation_events_evidence_hash_ck CHECK (
      evidence_hash ~ '^[0-9a-f]{64}$'
    ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT ipro_identity_reconciliation_events_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ipro_identity_reconciliation_events_evidence_fk
    FOREIGN KEY (evidence_id, evidence_hash)
    REFERENCES ipro.order_document_evidence(id, evidence_hash) ON DELETE RESTRICT,
  CONSTRAINT ipro_identity_reconciliation_events_new_document_shape_ck CHECK (
    (new_document_type IS NULL AND new_document IS NULL)
    OR (
      new_document_type = 'CPF'
      AND new_document ~ '^[0-9]{11}$'
      AND new_document !~ '^([0-9])\1{10}$'
    )
    OR (
      new_document_type = 'CNPJ'
      AND new_document ~ '^[0-9]{14}$'
      AND new_document !~ '^([0-9])\1{13}$'
    )
  ),
  CONSTRAINT ipro_identity_reconciliation_events_target_ck CHECK (
    (
      action = 'TRANSACTION_IDENTITY_RECONCILED'
      AND transaction_id IS NOT NULL
      AND customer_document_id IS NULL
      AND (
        (evidence_id IS NOT NULL AND evidence_kind = 'SOURCE_ORDER_DOCUMENT')
        OR (
          evidence_id IS NULL
          AND evidence_kind IN ('DIRECT_DOCUMENT', 'STABLE_REGISTRY_DOCUMENT')
        )
      )
      AND new_customer_entity_id IS NOT NULL
      AND prior_resolution_state IS NOT NULL
      AND new_resolution_state = 'RESOLVED'
      AND new_document_type IS NOT NULL
      AND new_document IS NOT NULL
      AND preserved_event_identity_hash IS NOT NULL
      AND preserved_event_identity_hash ~ '^[0-9a-f]{64}$'
      AND preserved_material_content_hash IS NOT NULL
      AND preserved_material_content_hash ~ '^[0-9a-f]{64}$'
    )
    OR
    (
      action = 'CUSTOMER_DOCUMENT_TYPE_CORRECTED'
      AND transaction_id IS NULL
      AND customer_document_id IS NOT NULL
      AND prior_customer_entity_id IS NULL
      AND new_customer_entity_id IS NULL
      AND prior_resolution_state IS NULL
      AND new_resolution_state IS NULL
      AND prior_document_type IS NOT NULL
      AND prior_document IS NOT NULL
      AND new_document_type IS NOT NULL
      AND new_document IS NOT NULL
      AND (prior_document_type, prior_document) IS DISTINCT FROM (new_document_type, new_document)
      AND evidence_id IS NULL
      AND evidence_kind = 'DOCUMENT_TYPE_SHAPE_CORRECTION'
      AND preserved_event_identity_hash IS NULL
      AND preserved_material_content_hash IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_ipro_identity_reconciliation_events_run_created
  ON ipro.identity_reconciliation_events (run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ipro_identity_reconciliation_events_evidence
  ON ipro.identity_reconciliation_events (evidence_id)
  WHERE evidence_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ipro_identity_reconciliation_events_run_transaction
  ON ipro.identity_reconciliation_events (run_id, transaction_id)
  WHERE action = 'TRANSACTION_IDENTITY_RECONCILED';

CREATE UNIQUE INDEX IF NOT EXISTS ux_ipro_identity_reconciliation_events_run_document_correction
  ON ipro.identity_reconciliation_events (run_id, customer_document_id)
  WHERE action = 'CUSTOMER_DOCUMENT_TYPE_CORRECTED';

ALTER TABLE ipro.transactions
  ADD COLUMN IF NOT EXISTS effective_identity_reconciliation_event_id TEXT;

DO $transaction_event_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ipro.transactions'::regclass
      AND conname = 'ipro_transactions_effective_identity_reconciliation_event_fk'
  ) THEN
    ALTER TABLE ipro.transactions
      ADD CONSTRAINT ipro_transactions_effective_identity_reconciliation_event_fk
      FOREIGN KEY (effective_identity_reconciliation_event_id)
      REFERENCES ipro.identity_reconciliation_events(id) ON DELETE RESTRICT;
  END IF;
END;
$transaction_event_fk$;

CREATE INDEX IF NOT EXISTS idx_ipro_transactions_effective_identity_reconciliation_event
  ON ipro.transactions (effective_identity_reconciliation_event_id)
  WHERE effective_identity_reconciliation_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION ipro.prevent_identity_reconciliation_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, ipro
AS $function$
BEGIN
  RAISE EXCEPTION 'IPRO_IDENTITY_RECONCILIATION_AUDIT_IMMUTABLE: %.%',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS ipro_identity_reconciliation_runs_immutable_trg
  ON ipro.identity_reconciliation_runs;
CREATE TRIGGER ipro_identity_reconciliation_runs_immutable_trg
  BEFORE UPDATE OR DELETE ON ipro.identity_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION ipro.prevent_identity_reconciliation_audit_mutation();

DROP TRIGGER IF EXISTS ipro_order_document_evidence_immutable_trg
  ON ipro.order_document_evidence;
CREATE TRIGGER ipro_order_document_evidence_immutable_trg
  BEFORE UPDATE OR DELETE ON ipro.order_document_evidence
  FOR EACH ROW EXECUTE FUNCTION ipro.prevent_identity_reconciliation_audit_mutation();

DROP TRIGGER IF EXISTS ipro_identity_reconciliation_events_immutable_trg
  ON ipro.identity_reconciliation_events;
CREATE TRIGGER ipro_identity_reconciliation_events_immutable_trg
  BEFORE UPDATE OR DELETE ON ipro.identity_reconciliation_events
  FOR EACH ROW EXECUTE FUNCTION ipro.prevent_identity_reconciliation_audit_mutation();

REVOKE ALL PRIVILEGES ON TABLE ipro.identity_reconciliation_runs FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE ipro.order_document_evidence FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE ipro.identity_reconciliation_events FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION ipro.prevent_identity_reconciliation_audit_mutation() FROM PUBLIC;
