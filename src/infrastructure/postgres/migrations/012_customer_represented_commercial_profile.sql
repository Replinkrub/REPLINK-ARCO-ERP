CREATE TABLE IF NOT EXISTS customer_represented_commercial_profiles (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  represented_company_id TEXT NOT NULL,
  default_price_table_id TEXT,
  default_payment_term_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_id, represented_company_id),
  CONSTRAINT customer_represented_profiles_customer_tenant_fkey
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers(tenant_id, id),
  CONSTRAINT customer_represented_profiles_represented_tenant_fkey
    FOREIGN KEY (tenant_id, represented_company_id)
    REFERENCES represented_companies(tenant_id, id),
  CONSTRAINT customer_represented_profiles_price_table_tenant_fkey
    FOREIGN KEY (tenant_id, default_price_table_id)
    REFERENCES price_tables(tenant_id, id),
  CONSTRAINT customer_represented_profiles_payment_term_tenant_fkey
    FOREIGN KEY (tenant_id, default_payment_term_id)
    REFERENCES payment_terms(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_customer_represented_profiles_tenant_represented
ON customer_represented_commercial_profiles (tenant_id, represented_company_id);

CREATE INDEX IF NOT EXISTS idx_customer_represented_profiles_tenant_price_table
ON customer_represented_commercial_profiles (tenant_id, default_price_table_id);

CREATE INDEX IF NOT EXISTS idx_customer_represented_profiles_tenant_payment_term
ON customer_represented_commercial_profiles (tenant_id, default_payment_term_id);

CREATE TABLE IF NOT EXISTS customer_product_price_overrides (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  represented_company_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  unit_price NUMERIC(14, 4) NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT customer_product_price_overrides_profile_fkey
    FOREIGN KEY (tenant_id, customer_id, represented_company_id)
    REFERENCES customer_represented_commercial_profiles(tenant_id, customer_id, represented_company_id),
  CONSTRAINT customer_product_price_overrides_product_tenant_fkey
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES products(tenant_id, id),
  CONSTRAINT customer_product_price_overrides_unit_price_check CHECK (unit_price > 0),
  CONSTRAINT customer_product_price_overrides_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT customer_product_price_overrides_valid_until_check CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_customer_product_price_overrides_scope
ON customer_product_price_overrides (tenant_id, customer_id, represented_company_id, product_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_product_price_overrides_validity
ON customer_product_price_overrides (tenant_id, product_id, valid_from, valid_until);
