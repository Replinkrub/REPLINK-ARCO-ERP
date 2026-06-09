CREATE TABLE IF NOT EXISTS price_tables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  represented_company_id TEXT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  valid_from DATE NOT NULL,
  valid_until DATE,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT price_tables_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT price_tables_represented_company_tenant_fkey
    FOREIGN KEY (tenant_id, represented_company_id)
    REFERENCES represented_companies(tenant_id, id),
  CONSTRAINT price_tables_currency_format_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT price_tables_valid_until_check CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_price_tables_tenant_name_without_represented_unique
ON price_tables (tenant_id, name)
WHERE represented_company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_price_tables_tenant_represented_name_unique
ON price_tables (tenant_id, represented_company_id, name)
WHERE represented_company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_price_tables_tenant_status
ON price_tables (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_price_tables_tenant_represented
ON price_tables (tenant_id, represented_company_id);
