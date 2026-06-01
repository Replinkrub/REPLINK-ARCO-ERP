CREATE TABLE IF NOT EXISTS commercial_documents (
  id TEXT PRIMARY KEY,
  document_type TEXT NOT NULL CHECK (document_type IN ('quote', 'order')),
  number TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  customer_id TEXT,
  owner_id TEXT NOT NULL,
  representative_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUOTE_DRAFT', 'ORDER_CONFIRMED', 'INVOICED', 'CANCELED')),
  items JSONB NOT NULL,
  totals JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  invoiced_at TIMESTAMPTZ,
  invoice_manual_reference TEXT,
  source_quote_id TEXT,
  source_quote_number TEXT,
  source_quote_revision TEXT,
  converted_at TIMESTAMPTZ,
  source_quote_snapshot JSONB,
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  cancel_note TEXT,
  lifecycle_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  order_revisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT source_quote_unique UNIQUE (source_quote_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_documents_tenant ON commercial_documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_commercial_documents_tenant_representative ON commercial_documents (tenant_id, representative_id);
CREATE INDEX IF NOT EXISTS idx_commercial_documents_status ON commercial_documents (status);
