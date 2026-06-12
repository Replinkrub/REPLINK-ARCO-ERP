CREATE OR REPLACE FUNCTION validate_customer_represented_profile_defaults()
RETURNS trigger AS $$
DECLARE
  price_table_represented_company_id TEXT;
BEGIN
  IF NEW.default_price_table_id IS NOT NULL THEN
    SELECT represented_company_id
      INTO price_table_represented_company_id
      FROM price_tables
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.default_price_table_id;

    IF price_table_represented_company_id IS NOT NULL
       AND price_table_represented_company_id <> NEW.represented_company_id THEN
      RAISE EXCEPTION 'default price table represented company mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_represented_profile_defaults_guard
ON customer_represented_commercial_profiles;

CREATE TRIGGER trg_customer_represented_profile_defaults_guard
BEFORE INSERT OR UPDATE ON customer_represented_commercial_profiles
FOR EACH ROW
EXECUTE FUNCTION validate_customer_represented_profile_defaults();

CREATE OR REPLACE FUNCTION validate_customer_product_price_override_represented()
RETURNS trigger AS $$
DECLARE
  product_represented_company_id TEXT;
BEGIN
  SELECT represented_company_id
    INTO product_represented_company_id
    FROM products
   WHERE tenant_id = NEW.tenant_id
     AND id = NEW.product_id;

  IF product_represented_company_id IS NOT NULL
     AND product_represented_company_id <> NEW.represented_company_id THEN
    RAISE EXCEPTION 'override product represented company mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_product_price_override_represented_guard
ON customer_product_price_overrides;

CREATE TRIGGER trg_customer_product_price_override_represented_guard
BEFORE INSERT OR UPDATE ON customer_product_price_overrides
FOR EACH ROW
EXECUTE FUNCTION validate_customer_product_price_override_represented();
