CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_product_price_overrides_one_active
ON customer_product_price_overrides (tenant_id, customer_id, represented_company_id, product_id)
WHERE status = 'active';
