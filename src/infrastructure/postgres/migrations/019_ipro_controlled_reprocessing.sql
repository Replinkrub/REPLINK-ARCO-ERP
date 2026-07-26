-- A source file remains immutable and globally deduplicated by content_hash.
-- Reprocessing reuses that source_file_id in a new batch; only transaction
-- uniqueness becomes batch-scoped so each processing fingerprint can produce
-- its own generation.
ALTER TABLE ipro.ingestion_batches
  ADD COLUMN IF NOT EXISTS processing_fingerprint TEXT;

UPDATE ipro.ingestion_batches
SET processing_fingerprint = COALESCE(
  NULLIF(BTRIM(processing_fingerprint), ''),
  NULLIF(BTRIM(metadata->>'processing_fingerprint'), ''),
  'legacy:idempotency:' || idempotency_key
)
WHERE processing_fingerprint IS NULL
   OR BTRIM(processing_fingerprint) = '';

ALTER TABLE ipro.ingestion_batches
  ALTER COLUMN processing_fingerprint SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ipro.ingestion_batches'::regclass
      AND conname = 'ipro_ingestion_batches_processing_fingerprint_nonempty_ck'
  ) THEN
    ALTER TABLE ipro.ingestion_batches
      ADD CONSTRAINT ipro_ingestion_batches_processing_fingerprint_nonempty_ck
      CHECK (BTRIM(processing_fingerprint) <> '');
  END IF;
END $$;

-- Canonical represented-company IDs contain no POSIX whitespace or control
-- characters. The same immutable expression is reused for legacy cleanup,
-- backfill, constraints, collision preflight, and unique-index scope.
CREATE OR REPLACE FUNCTION ipro.canonical_represented_company_id(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $function$
  WITH boundary_normalized AS (
    SELECT REGEXP_REPLACE(
      REGEXP_REPLACE(value, '^[[:space:][:cntrl:]]+', ''),
      '[[:space:][:cntrl:]]+$',
      ''
    ) AS normalized_value
  )
  SELECT CASE
    WHEN normalized_value = ''
      OR normalized_value ~ '[[:space:][:cntrl:]]'
    THEN NULL
    ELSE normalized_value
  END
  FROM boundary_normalized
$function$;

ALTER TABLE ipro.product_entities
  ADD COLUMN IF NOT EXISTS represented_company_id TEXT;

ALTER TABLE ipro.product_aliases
  ADD COLUMN IF NOT EXISTS represented_company_id TEXT;

ALTER TABLE ipro.product_resolutions
  ADD COLUMN IF NOT EXISTS represented_company_id TEXT;

UPDATE ipro.product_entities
SET represented_company_id = NULL
WHERE represented_company_id IS NOT NULL
  AND represented_company_id ~ '^[[:space:][:cntrl:]]*$';

UPDATE ipro.product_entities
SET represented_company_id = ipro.canonical_represented_company_id(represented_company_id)
WHERE ipro.canonical_represented_company_id(represented_company_id) IS NOT NULL
  AND represented_company_id IS DISTINCT FROM ipro.canonical_represented_company_id(represented_company_id);

UPDATE ipro.product_entities
SET represented_company_id = ipro.canonical_represented_company_id(metadata->>'represented_company_stable_id')
WHERE represented_company_id IS NULL
  AND ipro.canonical_represented_company_id(metadata->>'represented_company_stable_id') IS NOT NULL;

UPDATE ipro.product_aliases
SET represented_company_id = NULL
WHERE represented_company_id IS NOT NULL
  AND represented_company_id ~ '^[[:space:][:cntrl:]]*$';

UPDATE ipro.product_aliases
SET represented_company_id = ipro.canonical_represented_company_id(represented_company_id)
WHERE ipro.canonical_represented_company_id(represented_company_id) IS NOT NULL
  AND represented_company_id IS DISTINCT FROM ipro.canonical_represented_company_id(represented_company_id);

UPDATE ipro.product_aliases AS pa
SET represented_company_id = COALESCE(
  ipro.canonical_represented_company_id(pa.metadata->>'represented_company_stable_id'),
  pe.represented_company_id
)
FROM ipro.product_entities AS pe
WHERE pa.product_entity_id = pe.id
  AND pa.represented_company_id IS NULL
  AND COALESCE(
    ipro.canonical_represented_company_id(pa.metadata->>'represented_company_stable_id'),
    pe.represented_company_id
  ) IS NOT NULL;

UPDATE ipro.product_resolutions
SET represented_company_id = NULL
WHERE represented_company_id IS NOT NULL
  AND represented_company_id ~ '^[[:space:][:cntrl:]]*$';

UPDATE ipro.product_resolutions
SET represented_company_id = ipro.canonical_represented_company_id(represented_company_id)
WHERE ipro.canonical_represented_company_id(represented_company_id) IS NOT NULL
  AND represented_company_id IS DISTINCT FROM ipro.canonical_represented_company_id(represented_company_id);

UPDATE ipro.product_resolutions
SET represented_company_id = ipro.canonical_represented_company_id(metadata->>'represented_company_stable_id')
WHERE represented_company_id IS NULL
  AND ipro.canonical_represented_company_id(metadata->>'represented_company_stable_id') IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ipro.product_entities'::regclass
      AND conname = 'ipro_product_entities_represented_company_id_canonical_ck'
  ) THEN
    ALTER TABLE ipro.product_entities
      ADD CONSTRAINT ipro_product_entities_represented_company_id_canonical_ck
      CHECK (
        represented_company_id IS NULL
        OR (
          ipro.canonical_represented_company_id(represented_company_id) IS NOT NULL
          AND represented_company_id = ipro.canonical_represented_company_id(represented_company_id)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ipro.product_aliases'::regclass
      AND conname = 'ipro_product_aliases_represented_company_id_canonical_ck'
  ) THEN
    ALTER TABLE ipro.product_aliases
      ADD CONSTRAINT ipro_product_aliases_represented_company_id_canonical_ck
      CHECK (
        represented_company_id IS NULL
        OR (
          ipro.canonical_represented_company_id(represented_company_id) IS NOT NULL
          AND represented_company_id = ipro.canonical_represented_company_id(represented_company_id)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ipro.product_resolutions'::regclass
      AND conname = 'ipro_product_resolutions_represented_company_id_canonical_ck'
  ) THEN
    ALTER TABLE ipro.product_resolutions
      ADD CONSTRAINT ipro_product_resolutions_represented_company_id_canonical_ck
      CHECK (
        represented_company_id IS NULL
        OR (
          ipro.canonical_represented_company_id(represented_company_id) IS NOT NULL
          AND represented_company_id = ipro.canonical_represented_company_id(represented_company_id)
        )
      );
  END IF;
END $$;

-- Fail before replacing any legacy unique index if stable-scope backfill would
-- collapse distinct historical rows. The canonical runner rolls this whole
-- migration back, including the columns and backfills above.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ipro.product_entities
    WHERE sku IS NOT NULL
    GROUP BY sku, COALESCE(ipro.canonical_represented_company_id(represented_company_id), represented_company, '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'IPRO_019_STABLE_SCOPE_COLLISION: product_entities sku';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ipro.product_entities
    WHERE product_code IS NOT NULL
    GROUP BY product_code, COALESCE(ipro.canonical_represented_company_id(represented_company_id), represented_company, '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'IPRO_019_STABLE_SCOPE_COLLISION: product_entities product_code';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ipro.product_aliases
    GROUP BY
      source_type,
      alias_type,
      COALESCE(ipro.canonical_represented_company_id(represented_company_id), represented_company, ''),
      COALESCE(normalized_value, ''),
      COALESCE(safe_hash, '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'IPRO_019_STABLE_SCOPE_COLLISION: product_aliases lookup';
  END IF;
END $$;

DROP INDEX IF EXISTS ipro.ux_ipro_product_entities_sku_represented;
DROP INDEX IF EXISTS ipro.ux_ipro_product_entities_code_represented;
DROP INDEX IF EXISTS ipro.ux_ipro_product_aliases_lookup_represented;

CREATE UNIQUE INDEX ux_ipro_product_entities_sku_represented
  ON ipro.product_entities (
    sku,
    COALESCE(ipro.canonical_represented_company_id(represented_company_id), represented_company, '')
  )
  WHERE sku IS NOT NULL;

CREATE UNIQUE INDEX ux_ipro_product_entities_code_represented
  ON ipro.product_entities (
    product_code,
    COALESCE(ipro.canonical_represented_company_id(represented_company_id), represented_company, '')
  )
  WHERE product_code IS NOT NULL;

CREATE UNIQUE INDEX ux_ipro_product_aliases_lookup_represented
  ON ipro.product_aliases (
    source_type,
    alias_type,
    COALESCE(ipro.canonical_represented_company_id(represented_company_id), represented_company, ''),
    COALESCE(normalized_value, ''),
    COALESCE(safe_hash, '')
  );

DO $$
DECLARE
  constraint_to_drop RECORD;
BEGIN
  FOR constraint_to_drop IN
    SELECT c.conname
    FROM pg_constraint AS c
    WHERE c.conrelid = 'ipro.transactions'::regclass
      AND c.contype = 'u'
      AND (
        ARRAY(
          SELECT a.attname::TEXT
          FROM unnest(c.conkey) WITH ORDINALITY AS key_column(attnum, ordinal_position)
          JOIN pg_attribute AS a
            ON a.attrelid = c.conrelid
           AND a.attnum = key_column.attnum
          ORDER BY key_column.ordinal_position
        ) = ARRAY['source_file_id', 'source_row_hash']::TEXT[]
        OR ARRAY(
          SELECT a.attname::TEXT
          FROM unnest(c.conkey) WITH ORDINALITY AS key_column(attnum, ordinal_position)
          JOIN pg_attribute AS a
            ON a.attrelid = c.conrelid
           AND a.attnum = key_column.attnum
          ORDER BY key_column.ordinal_position
        ) = ARRAY['business_event_hash']::TEXT[]
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE ipro.transactions DROP CONSTRAINT %I',
      constraint_to_drop.conname
    );
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ipro_transactions_batch_source_row_hash
  ON ipro.transactions (batch_id, source_file_id, source_row_hash);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ipro_transactions_batch_business_event_hash
  ON ipro.transactions (batch_id, business_event_hash);
