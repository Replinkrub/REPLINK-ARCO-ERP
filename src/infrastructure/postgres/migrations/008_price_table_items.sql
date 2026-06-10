CREATE TABLE IF NOT EXISTS price_table_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  price_table_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  unit_price NUMERIC(14, 4) NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT price_table_items_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT price_table_items_price_table_tenant_fkey
    FOREIGN KEY (tenant_id, price_table_id)
    REFERENCES price_tables(tenant_id, id),
  CONSTRAINT price_table_items_product_tenant_fkey
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES products(tenant_id, id),
  CONSTRAINT price_table_items_unit_price_positive CHECK (unit_price > 0),
  CONSTRAINT price_table_items_valid_until_check CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_price_table_items_tenant_table_product
ON price_table_items (tenant_id, price_table_id, product_id);

CREATE INDEX IF NOT EXISTS idx_price_table_items_tenant_table_product_validity
ON price_table_items (tenant_id, price_table_id, product_id, valid_from, valid_until);

CREATE INDEX IF NOT EXISTS idx_price_table_items_tenant_status
ON price_table_items (tenant_id, status);
