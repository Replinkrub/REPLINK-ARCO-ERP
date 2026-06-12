CREATE TABLE IF NOT EXISTS payment_terms (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  installments_count INTEGER NOT NULL,
  first_due_days INTEGER NOT NULL,
  interval_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT payment_terms_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT payment_terms_installments_count_check CHECK (installments_count >= 1),
  CONSTRAINT payment_terms_first_due_days_check CHECK (first_due_days >= 0),
  CONSTRAINT payment_terms_interval_days_check CHECK (interval_days >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_terms_tenant_name
ON payment_terms (tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_payment_terms_tenant_status
ON payment_terms (tenant_id, status);
