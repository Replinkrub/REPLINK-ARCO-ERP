ALTER TABLE customer_commercial_profiles
ADD COLUMN IF NOT EXISTS default_price_table_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_commercial_profiles_default_price_table_tenant_fkey'
      AND conrelid = 'customer_commercial_profiles'::regclass
  ) THEN
    ALTER TABLE customer_commercial_profiles
    ADD CONSTRAINT customer_commercial_profiles_default_price_table_tenant_fkey
    FOREIGN KEY (tenant_id, default_price_table_id)
    REFERENCES price_tables(tenant_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_commercial_profiles_tenant_default_price_table
ON customer_commercial_profiles (tenant_id, default_price_table_id);
