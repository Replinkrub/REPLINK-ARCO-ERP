DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM commercial_documents
    WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_DOCUMENTS_TENANT_NULL_EXISTS';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM commercial_documents cd
    LEFT JOIN tenants t ON t.id = cd.tenant_id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_DOCUMENTS_TENANT_ORPHANS_EXIST';
  END IF;
END $$;

ALTER TABLE commercial_documents
ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commercial_documents_tenant_id_fkey'
      AND conrelid = 'commercial_documents'::regclass
  ) THEN
    ALTER TABLE commercial_documents
    ADD CONSTRAINT commercial_documents_tenant_id_fkey
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id);
  END IF;
END $$;
