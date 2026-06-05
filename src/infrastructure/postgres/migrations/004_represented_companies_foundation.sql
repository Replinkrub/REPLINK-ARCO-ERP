CREATE TABLE IF NOT EXISTS represented_companies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT represented_companies_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT represented_companies_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_represented_companies_tenant_status
ON represented_companies (tenant_id, status);

ALTER TABLE commercial_documents
ADD COLUMN IF NOT EXISTS represented_company_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commercial_documents_represented_company_tenant_fkey'
      AND conrelid = 'commercial_documents'::regclass
  ) THEN
    ALTER TABLE commercial_documents
    ADD CONSTRAINT commercial_documents_represented_company_tenant_fkey
    FOREIGN KEY (tenant_id, represented_company_id)
    REFERENCES represented_companies(tenant_id, id);
  END IF;
END $$;
