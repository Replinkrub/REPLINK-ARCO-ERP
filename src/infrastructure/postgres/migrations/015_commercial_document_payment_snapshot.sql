ALTER TABLE commercial_documents
  ADD COLUMN IF NOT EXISTS payment_term_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_term_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS payment_schedule JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commercial_documents_payment_term_fk'
  ) THEN
    ALTER TABLE commercial_documents
      ADD CONSTRAINT commercial_documents_payment_term_fk
      FOREIGN KEY (tenant_id, payment_term_id)
      REFERENCES payment_terms(tenant_id, id);
  END IF;
END $$;
