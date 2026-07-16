ALTER TABLE ipro.product_aliases
  ADD COLUMN IF NOT EXISTS represented_company TEXT;

UPDATE ipro.product_aliases pa
SET represented_company = pe.represented_company
FROM ipro.product_entities pe
WHERE pa.product_entity_id = pe.id
  AND pa.represented_company IS DISTINCT FROM pe.represented_company;

DROP INDEX IF EXISTS ipro.ux_ipro_product_aliases_lookup;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ipro_product_aliases_lookup_represented
  ON ipro.product_aliases (
    source_type,
    alias_type,
    COALESCE(represented_company, ''),
    COALESCE(normalized_value, ''),
    COALESCE(safe_hash, '')
  );
