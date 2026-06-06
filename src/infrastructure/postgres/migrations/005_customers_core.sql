CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  document_type TEXT NOT NULL,
  document_number TEXT NOT NULL,
  state_registration TEXT,
  municipal_registration TEXT,
  tax_regime TEXT,
  phone TEXT,
  email TEXT,
  whatsapp TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  segment TEXT,
  notes TEXT,
  owner_id TEXT,
  representative_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customers_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT customers_tenant_document_unique UNIQUE (tenant_id, document_type, document_number)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_status
ON customers (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_document
ON customers (tenant_id, document_type, document_number);

CREATE TABLE IF NOT EXISTS customer_contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role_title TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_contacts_customer_tenant_fkey
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_tenant_customer
ON customer_contacts (tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  address_type TEXT NOT NULL CHECK (address_type IN ('main', 'delivery', 'billing', 'other')),
  zipcode TEXT,
  street TEXT NOT NULL,
  number TEXT,
  complement TEXT,
  district TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'BR',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_addresses_customer_tenant_fkey
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_tenant_customer
ON customer_addresses (tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS customer_commercial_profiles (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  default_payment_term_id TEXT,
  default_price_table_id TEXT,
  credit_limit NUMERIC(14, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_commercial_profiles_customer_unique UNIQUE (tenant_id, customer_id),
  CONSTRAINT customer_commercial_profiles_customer_tenant_fkey
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_customer_commercial_profiles_tenant_customer
ON customer_commercial_profiles (tenant_id, customer_id);
