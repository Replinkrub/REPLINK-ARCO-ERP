CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_categories_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT product_categories_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_status
ON product_categories (tenant_id, status);

CREATE TABLE IF NOT EXISTS product_units (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_units_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT product_units_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_product_units_tenant_status
ON product_units (tenant_id, status);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  represented_company_id TEXT,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  commercial_name TEXT,
  barcode TEXT,
  brand TEXT,
  category_id TEXT,
  unit_id TEXT,
  package_info TEXT,
  minimum_order_quantity NUMERIC(14, 3),
  multiple_order_quantity NUMERIC(14, 3),
  gross_weight NUMERIC(14, 3),
  net_weight NUMERIC(14, 3),
  dimensions TEXT,
  availability_status TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT products_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT products_represented_company_tenant_fkey
    FOREIGN KEY (tenant_id, represented_company_id)
    REFERENCES represented_companies(tenant_id, id),
  CONSTRAINT products_category_tenant_fkey
    FOREIGN KEY (tenant_id, category_id)
    REFERENCES product_categories(tenant_id, id),
  CONSTRAINT products_unit_tenant_fkey
    FOREIGN KEY (tenant_id, unit_id)
    REFERENCES product_units(tenant_id, id),
  CONSTRAINT products_minimum_order_quantity_non_negative CHECK (minimum_order_quantity IS NULL OR minimum_order_quantity >= 0),
  CONSTRAINT products_multiple_order_quantity_non_negative CHECK (multiple_order_quantity IS NULL OR multiple_order_quantity >= 0),
  CONSTRAINT products_gross_weight_non_negative CHECK (gross_weight IS NULL OR gross_weight >= 0),
  CONSTRAINT products_net_weight_non_negative CHECK (net_weight IS NULL OR net_weight >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_sku_without_represented_unique
ON products (tenant_id, sku)
WHERE represented_company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_represented_sku_unique
ON products (tenant_id, represented_company_id, sku)
WHERE represented_company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_tenant_status
ON products (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_products_tenant_represented
ON products (tenant_id, represented_company_id);
