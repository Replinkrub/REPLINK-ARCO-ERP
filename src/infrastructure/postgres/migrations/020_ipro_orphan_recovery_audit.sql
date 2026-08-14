-- ARCO-ERP owns this append-only audit contract.  It never creates or changes
-- IPRO runtime relations; it only verifies the runtime contract when present.
CREATE TABLE IF NOT EXISTS ipro.import_recovery_events (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CONSTRAINT ipro_import_recovery_events_action_ck CHECK (action IN (
    'LEGACY_ORPHAN_ATTESTED', 'RECOVERY_CLAIMED', 'RECOVERY_COMPLETED',
    'RECOVERY_BLOCKED', 'RECOVERY_FAILED'
  )),
  reason TEXT NOT NULL CONSTRAINT ipro_import_recovery_events_reason_ck CHECK (
    reason = BTRIM(reason) AND reason ~ '^[A-Z][A-Z0-9_]{0,127}$'
  ),
  actor TEXT NOT NULL CONSTRAINT ipro_import_recovery_events_actor_ck CHECK (
    actor = BTRIM(actor) AND actor <> '' AND char_length(actor) <= 256
  ),
  request_id TEXT CONSTRAINT ipro_import_recovery_events_request_id_ck CHECK (
    request_id = BTRIM(request_id) AND request_id <> '' AND char_length(request_id) <= 256
  ),
  recovery_mode TEXT NOT NULL CONSTRAINT ipro_import_recovery_events_mode_ck CHECK (
    recovery_mode = 'LEGACY_ORPHAN_RECOVERY'
  ),
  recovery_version TEXT NOT NULL CONSTRAINT ipro_import_recovery_events_version_ck CHECK (
    recovery_version = 'ipro.orphan_recovery.v1'
  ),
  manifest_hash TEXT CONSTRAINT ipro_import_recovery_events_manifest_hash_ck CHECK (
    manifest_hash ~ '^[0-9a-f]{64}$'
  ),
  object_receipt TEXT CONSTRAINT ipro_import_recovery_events_object_receipt_ck CHECK (
    object_receipt ~ '^[0-9a-f]{64}$'
  ),
  eligible_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ipro_import_recovery_events_eligible_at_ck CHECK (eligible_at <= created_at),
  CONSTRAINT ipro_import_recovery_events_attestation_binding_ck CHECK (
    action <> 'LEGACY_ORPHAN_ATTESTED'
    OR (manifest_hash IS NOT NULL AND object_receipt IS NOT NULL)
  )
);

-- Fail rather than silently accepting a previous local draft with a different
-- contract.  IPRO queries these exact names when appending outcome events.
DO $audit_schema_preflight$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'ipro' AND table_name = 'import_recovery_events'
        AND (column_name, data_type, is_nullable) IN (
          ('id', 'text', 'NO'), ('batch_id', 'text', 'NO'), ('action', 'text', 'NO'),
          ('reason', 'text', 'NO'), ('actor', 'text', 'NO'), ('request_id', 'text', 'YES'),
          ('recovery_mode', 'text', 'NO'), ('recovery_version', 'text', 'NO'),
          ('manifest_hash', 'text', 'YES'), ('object_receipt', 'text', 'YES'),
          ('eligible_at', 'timestamp with time zone', 'NO'), ('created_at', 'timestamp with time zone', 'NO')
        )) <> 12
     OR (SELECT COUNT(*) FROM pg_constraint
         WHERE conrelid = 'ipro.import_recovery_events'::regclass
           AND conname IN (
             'ipro_import_recovery_events_action_ck', 'ipro_import_recovery_events_reason_ck',
             'ipro_import_recovery_events_actor_ck', 'ipro_import_recovery_events_request_id_ck',
             'ipro_import_recovery_events_mode_ck', 'ipro_import_recovery_events_version_ck',
             'ipro_import_recovery_events_manifest_hash_ck', 'ipro_import_recovery_events_object_receipt_ck',
             'ipro_import_recovery_events_eligible_at_ck', 'ipro_import_recovery_events_attestation_binding_ck'
           )) <> 10 THEN
    RAISE EXCEPTION 'IPRO_020_AUDIT_SCHEMA_INVALID';
  END IF;
END;
$audit_schema_preflight$;

CREATE INDEX IF NOT EXISTS idx_ipro_import_recovery_events_batch_created
  ON ipro.import_recovery_events (batch_id, created_at DESC);

CREATE OR REPLACE FUNCTION ipro.prevent_import_recovery_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'IPRO_IMPORT_RECOVERY_EVENT_IMMUTABLE' USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS ipro_import_recovery_events_immutable_trg ON ipro.import_recovery_events;
CREATE TRIGGER ipro_import_recovery_events_immutable_trg
  BEFORE UPDATE OR DELETE ON ipro.import_recovery_events
  FOR EACH ROW EXECUTE FUNCTION ipro.prevent_import_recovery_event_mutation();

-- Serialize the preview exactly as ProductionImportService does: Python's
-- json.dumps(..., ensure_ascii=True, sort_keys=True) defaults (including its
-- spaces).  This is deliberately not jsonb::text: jsonb sorts object keys by
-- PostgreSQL's internal order, which is not Python's lexical sort order.
CREATE OR REPLACE FUNCTION ipro.ipro_020_utf8_codepoint(input_character TEXT)
RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog, ipro AS $function$
DECLARE encoded BYTEA := convert_to(input_character, 'UTF8'); first_byte INTEGER; byte_length INTEGER;
BEGIN
  first_byte := get_byte(encoded, 0); byte_length := octet_length(encoded);
  IF first_byte < 128 AND byte_length = 1 THEN RETURN first_byte; END IF;
  IF first_byte BETWEEN 192 AND 223 AND byte_length = 2 THEN
    RETURN ((first_byte & 31) << 6) | (get_byte(encoded, 1) & 63);
  END IF;
  IF first_byte BETWEEN 224 AND 239 AND byte_length = 3 THEN
    RETURN ((first_byte & 15) << 12) | ((get_byte(encoded, 1) & 63) << 6) | (get_byte(encoded, 2) & 63);
  END IF;
  IF first_byte BETWEEN 240 AND 247 AND byte_length = 4 THEN
    RETURN ((first_byte & 7) << 18) | ((get_byte(encoded, 1) & 63) << 12) | ((get_byte(encoded, 2) & 63) << 6) | (get_byte(encoded, 3) & 63);
  END IF;
  RAISE EXCEPTION 'IPRO_020_MANIFEST_UTF8_INVALID';
END;
$function$;

CREATE OR REPLACE FUNCTION ipro.ipro_020_json_string(value TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog, ipro AS $function$
DECLARE
  position INTEGER;
  character TEXT;
  codepoint INTEGER;
  escaped TEXT := '"';
BEGIN
  FOR position IN 1..char_length(value) LOOP
    character := substr(value, position, 1);
    codepoint := ipro.ipro_020_utf8_codepoint(character);
    IF character = '"' THEN escaped := escaped || '\\"';
    ELSIF character = '\\' THEN escaped := escaped || '\\\\';
    ELSIF codepoint = 8 THEN escaped := escaped || '\\b';
    ELSIF codepoint = 9 THEN escaped := escaped || '\\t';
    ELSIF codepoint = 10 THEN escaped := escaped || '\\n';
    ELSIF codepoint = 12 THEN escaped := escaped || '\\f';
    ELSIF codepoint = 13 THEN escaped := escaped || '\\r';
    ELSIF codepoint < 32 THEN escaped := escaped || '\\u' || lpad(to_hex(codepoint), 4, '0');
    ELSIF codepoint <= 127 THEN escaped := escaped || character;
    ELSIF codepoint <= 65535 THEN escaped := escaped || '\\u' || lpad(to_hex(codepoint), 4, '0');
    ELSE
      codepoint := codepoint - 65536;
      escaped := escaped || '\\u' || lpad(to_hex(55296 + (codepoint / 1024)), 4, '0')
        || '\\u' || lpad(to_hex(56320 + (codepoint % 1024)), 4, '0');
    END IF;
  END LOOP;
  RETURN escaped || '"';
END;
$function$;

CREATE OR REPLACE FUNCTION ipro.ipro_020_canonical_json(value JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog, ipro AS $function$
DECLARE
  kind TEXT := jsonb_typeof(value);
  rendered TEXT;
BEGIN
  IF kind = 'string' THEN RETURN ipro.ipro_020_json_string(value #>> '{}'); END IF;
  IF kind IN ('number', 'boolean', 'null') THEN RETURN value::TEXT; END IF;
  IF kind = 'array' THEN
    SELECT '[' || COALESCE(string_agg(ipro.ipro_020_canonical_json(element), ', ' ORDER BY ordinal), '') || ']'
      INTO rendered FROM jsonb_array_elements(value) WITH ORDINALITY AS items(element, ordinal);
    RETURN rendered;
  END IF;
  IF kind = 'object' THEN
    SELECT '{' || COALESCE(string_agg(
      ipro.ipro_020_json_string(key) || ': ' || ipro.ipro_020_canonical_json(element), ', ' ORDER BY key COLLATE "C"), '') || '}'
      INTO rendered FROM jsonb_each(value) AS items(key, element);
    RETURN rendered;
  END IF;
  RAISE EXCEPTION 'IPRO_020_MANIFEST_JSON_INVALID';
END;
$function$;

-- No unknown runtime principal receives access. An authorized operator records
-- one real non-privileged role and the binding grants exactly read + append.
CREATE TABLE IF NOT EXISTS ipro.import_recovery_runtime_role_contract (
  contract_key TEXT PRIMARY KEY CHECK (contract_key = 'ipro_orphan_recovery_runtime_role_v1'),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'VALIDATED')),
  runtime_role_name NAME,
  validated_at TIMESTAMPTZ,
  validated_by NAME,
  CHECK (
    (status = 'PENDING' AND runtime_role_name IS NULL AND validated_at IS NULL AND validated_by IS NULL)
    OR (status = 'VALIDATED' AND runtime_role_name IS NOT NULL AND validated_at IS NOT NULL AND validated_by IS NOT NULL)
  )
);

INSERT INTO ipro.import_recovery_runtime_role_contract (contract_key, status)
VALUES ('ipro_orphan_recovery_runtime_role_v1', 'PENDING')
ON CONFLICT (contract_key) DO NOTHING;

CREATE OR REPLACE FUNCTION ipro.append_import_recovery_outcome(
  event_id TEXT, target_batch_id TEXT, outcome_action TEXT, outcome_reason TEXT,
  outcome_actor TEXT, outcome_request_id TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ipro AS $function$
BEGIN
  IF event_id IS NULL OR event_id <> BTRIM(event_id) OR event_id = '' OR char_length(event_id) > 256
     OR target_batch_id IS NULL OR target_batch_id <> BTRIM(target_batch_id) OR target_batch_id = '' OR char_length(target_batch_id) > 256
     OR outcome_action NOT IN ('RECOVERY_CLAIMED', 'RECOVERY_COMPLETED', 'RECOVERY_BLOCKED', 'RECOVERY_FAILED')
     OR outcome_reason IS NULL OR outcome_reason <> BTRIM(outcome_reason) OR outcome_reason !~ '^[A-Z][A-Z0-9_]{0,127}$'
     OR outcome_actor IS NULL OR outcome_actor <> BTRIM(outcome_actor) OR outcome_actor = '' OR char_length(outcome_actor) > 256
     OR (outcome_request_id IS NOT NULL AND (outcome_request_id <> BTRIM(outcome_request_id) OR outcome_request_id = '' OR char_length(outcome_request_id) > 256))
  THEN
    RAISE EXCEPTION 'IPRO_020_RECOVERY_OUTCOME_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO ipro.import_recovery_events
    (id,batch_id,action,reason,actor,request_id,recovery_mode,recovery_version,eligible_at)
  VALUES
    (event_id,target_batch_id,outcome_action,outcome_reason,outcome_actor,outcome_request_id,
     'LEGACY_ORPHAN_RECOVERY','ipro.orphan_recovery.v1',now());
END;
$function$;

CREATE OR REPLACE FUNCTION ipro.register_import_recovery_runtime_role(candidate_role_name NAME)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ipro AS $function$
DECLARE
  contract ipro.import_recovery_runtime_role_contract%ROWTYPE;
  candidate pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO contract FROM ipro.import_recovery_runtime_role_contract
  WHERE contract_key = 'ipro_orphan_recovery_runtime_role_v1' FOR UPDATE;
  IF contract.status = 'VALIDATED' THEN
    IF contract.runtime_role_name = candidate_role_name THEN RETURN; END IF;
    RAISE EXCEPTION 'IPRO_020_RUNTIME_ROLE_ALREADY_VALIDATED';
  END IF;
  SELECT * INTO candidate FROM pg_roles WHERE rolname = candidate_role_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'IPRO_020_RUNTIME_ROLE_NOT_FOUND'; END IF;
  -- Evaluate every role the candidate can inherit or assume, recursively.  Do
  -- not use only has_*_privilege(candidate, ...): that would leave the
  -- registration decision dependent on the candidate's current INHERIT
  -- setting and obscure a dangerous privilege granted through a parent role.
  -- ACL grantee 0 is PUBLIC; PUBLIC is not represented in pg_auth_members.
  IF EXISTS (
       WITH RECURSIVE role_closure(role_oid) AS (
         VALUES (candidate.oid)
         UNION
         SELECT membership.roleid
         FROM pg_auth_members AS membership
         JOIN role_closure AS inherited ON inherited.role_oid = membership.member
       )
       SELECT 1
       FROM pg_roles AS inherited_role
       JOIN role_closure ON role_closure.role_oid = inherited_role.oid
       WHERE inherited_role.rolsuper OR inherited_role.rolcreaterole
          OR inherited_role.rolcreatedb OR inherited_role.rolreplication
          OR inherited_role.rolbypassrls
     )
     OR EXISTS (
       WITH RECURSIVE role_closure(role_oid) AS (
         VALUES (candidate.oid)
         UNION
         SELECT membership.roleid
         FROM pg_auth_members AS membership
         JOIN role_closure AS inherited ON inherited.role_oid = membership.member
       )
       SELECT 1 FROM role_closure
       WHERE has_table_privilege(role_oid, 'ipro.import_recovery_events', 'INSERT')
          OR has_table_privilege(role_oid, 'ipro.import_recovery_events', 'UPDATE')
          OR has_table_privilege(role_oid, 'ipro.import_recovery_events', 'DELETE')
     )
     OR EXISTS (
       WITH RECURSIVE role_closure(role_oid) AS (
         VALUES (candidate.oid)
         UNION
         SELECT membership.roleid
         FROM pg_auth_members AS membership
         JOIN role_closure AS inherited ON inherited.role_oid = membership.member
       )
       SELECT 1
       FROM role_closure
       CROSS JOIN pg_attribute AS attribute
       WHERE attribute.attrelid = 'ipro.import_recovery_events'::regclass
         AND attribute.attnum > 0 AND NOT attribute.attisdropped
         AND (
           has_column_privilege(role_oid, 'ipro.import_recovery_events', attribute.attname, 'INSERT')
           OR has_column_privilege(role_oid, 'ipro.import_recovery_events', attribute.attname, 'UPDATE')
         )
     )
     OR EXISTS (
       WITH RECURSIVE role_closure(role_oid) AS (
         VALUES (candidate.oid)
         UNION
         SELECT membership.roleid
         FROM pg_auth_members AS membership
         JOIN role_closure AS inherited ON inherited.role_oid = membership.member
       )
       SELECT 1 FROM role_closure
       WHERE has_schema_privilege(role_oid, 'ipro', 'CREATE')
     ) THEN
    RAISE EXCEPTION 'IPRO_020_RUNTIME_ROLE_PRIVILEGED';
  END IF;
  UPDATE ipro.import_recovery_runtime_role_contract
  SET status = 'VALIDATED', runtime_role_name = candidate_role_name,
      validated_at = now(), validated_by = session_user::NAME
  WHERE contract_key = contract.contract_key;
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE ipro.import_recovery_events FROM %I', candidate_role_name);
  EXECUTE format('REVOKE CREATE ON SCHEMA ipro FROM %I', candidate_role_name);
  EXECUTE format('GRANT USAGE ON SCHEMA ipro TO %I', candidate_role_name);
  EXECUTE format('GRANT SELECT ON TABLE ipro.import_recovery_events TO %I', candidate_role_name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION ipro.append_import_recovery_outcome(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO %I', candidate_role_name);
END;
$function$;

REVOKE ALL PRIVILEGES ON TABLE ipro.import_recovery_events FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE ipro.import_recovery_runtime_role_contract FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION ipro.register_import_recovery_runtime_role(NAME) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION ipro.append_import_recovery_outcome(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;

-- IPRO's production runtime owns these relations.  A clean ARCO 016–019
-- schema has none of them and is a valid no-attestation state.  A partial or
-- structurally incompatible runtime is unsafe and fails atomically.
DO $runtime_contract_preflight$
DECLARE
  target_exists BOOLEAN;
  object_exists BOOLEAN := to_regclass('ipro.import_source_objects') IS NOT NULL;
  activation_exists BOOLEAN := to_regclass('ipro.batch_activation_events') IS NOT NULL;
  object_is_table BOOLEAN;
  activation_is_table BOOLEAN;
  objects_compatible BOOLEAN;
  activation_compatible BOOLEAN;
  batch_compatible BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM ipro.ingestion_batches WHERE id = 'import_597ce7ad1da070861b95fc7e') INTO target_exists;
  SELECT c.relkind IN ('r', 'p') INTO object_is_table
  FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'ipro' AND c.relname = 'import_source_objects';
  SELECT c.relkind IN ('r', 'p') INTO activation_is_table
  FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'ipro' AND c.relname = 'batch_activation_events';
  SELECT COUNT(*) = 14 INTO objects_compatible FROM information_schema.columns
  WHERE table_schema = 'ipro' AND table_name = 'import_source_objects'
    AND (column_name, data_type, is_nullable) IN (
      ('id','text','NO'), ('batch_id','text','NO'), ('source_file_id','text','YES'),
      ('file_name','text','NO'), ('content_type','text','NO'), ('content_hash','text','NO'),
      ('byte_size','integer','NO'), ('report_type','text','NO'), ('row_count','integer','NO'),
      ('object_bytes','bytea','NO'), ('metadata','jsonb','NO'), ('status','text','NO'),
      ('created_at','timestamp with time zone','NO'), ('updated_at','timestamp with time zone','NO')
    );
  SELECT COUNT(*) = 7 INTO activation_compatible FROM information_schema.columns
  WHERE table_schema = 'ipro' AND table_name = 'batch_activation_events'
    AND (column_name, data_type, is_nullable) IN (
      ('id','text','NO'), ('dataset_key','text','NO'), ('rolled_back_batch_id','text','NO'),
      ('reactivated_batch_id','text','NO'), ('actor','text','NO'), ('reason','text','NO'),
      ('created_at','timestamp with time zone','NO')
    );
  SELECT COUNT(*) = 8 INTO batch_compatible FROM information_schema.columns
  WHERE table_schema = 'ipro' AND table_name = 'ingestion_batches'
    AND (column_name, data_type, is_nullable) IN (
      ('id','text','NO'), ('status','text','NO'), ('workflow_status','text','YES'),
      ('source_system','text','NO'), ('data_scope','text','NO'), ('input_file_count','integer','NO'),
      ('confirmation_idempotency_key','text','YES'), ('metadata','jsonb','NO')
    );
  IF object_exists <> activation_exists
     OR ((object_exists OR activation_exists) AND (
       NOT object_is_table OR NOT activation_is_table OR NOT objects_compatible OR NOT activation_compatible OR NOT batch_compatible
     ))
     OR (target_exists AND (NOT object_exists OR NOT activation_exists OR NOT batch_compatible)) THEN
    RAISE EXCEPTION 'IPRO_020_RUNTIME_CONTRACT_INVALID';
  END IF;
END;
$runtime_contract_preflight$;

-- Attest only the one historical, untouched runtime state.  The dynamic SQL
-- keeps a clean ARCO-only schema free of references to absent IPRO relations.
DO $legacy_orphan_attestation$
DECLARE
  candidate_requires_digest BOOLEAN := false;
BEGIN
  IF to_regclass('ipro.import_source_objects') IS NULL THEN RETURN; END IF;
  -- Lock the batch and its objects before observing the attestation evidence.
  -- Child runtime writes need the parent FK lock and object updates need these
  -- row locks, so the following candidate and receipt refer to one state.
  EXECUTE $lock_batch$
    SELECT 1 FROM ipro.ingestion_batches
    WHERE id = 'import_597ce7ad1da070861b95fc7e' FOR UPDATE
  $lock_batch$;
  EXECUTE $lock_objects$
    SELECT 1 FROM ipro.import_source_objects
    WHERE batch_id = 'import_597ce7ad1da070861b95fc7e' FOR UPDATE
  $lock_objects$;
  EXECUTE $candidate$
    SELECT EXISTS (
      SELECT 1 FROM ipro.ingestion_batches AS batch
      WHERE batch.id = 'import_597ce7ad1da070861b95fc7e'
        AND batch.status = 'PROCESSING' AND batch.workflow_status = 'AGUARDANDO_CONFIRMACAO'
        AND batch.data_scope = 'operational' AND batch.source_system = 'ipro_production_upload'
        AND batch.updated_at <= now()
        AND batch.input_file_count = 2
        AND batch.confirmation_idempotency_key IS NOT NULL
        AND char_length(batch.confirmation_idempotency_key) BETWEEN 8 AND 200
        AND jsonb_typeof(batch.metadata #> '{preview,files}') = 'array'
        AND jsonb_array_length(batch.metadata #> '{preview,files}') = 2
        AND batch.metadata #>> '{preview,manifest_hash}' ~ '^[0-9a-f]{64}$'
        AND (SELECT count(*) FROM ipro.import_source_objects object WHERE object.batch_id = batch.id) = 2
        AND NOT EXISTS (
          SELECT 1 FROM ipro.import_source_objects object
          WHERE object.batch_id = batch.id AND (
            object.status <> 'STAGED' OR object.source_file_id IS NOT NULL
            OR object.content_hash !~ '^[0-9a-f]{64}$' OR object.byte_size <> octet_length(object.object_bytes)
            OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(batch.metadata #> '{preview,files}') AS manifest(file)
              WHERE manifest.file->>'content_hash' = object.content_hash
                AND manifest.file->>'file_name' = object.file_name
                AND manifest.file->>'byte_size' = object.byte_size::TEXT
                AND manifest.file->>'report_type' = object.report_type
                AND manifest.file->>'row_count' = object.row_count::TEXT
                AND manifest.file ?& ARRAY['recognized_columns','missing_columns','period_start','period_end','duplicate_exact',
                  'source_rows','accepted_rows','rejected_rows','duplicate_rows','collapsed_rows','unique_records']
                AND object.metadata @> jsonb_build_object(
                  'recognized_columns', manifest.file->'recognized_columns',
                  'missing_columns', manifest.file->'missing_columns',
                  'period_start', manifest.file->'period_start',
                  'period_end', manifest.file->'period_end',
                  'duplicate_exact', manifest.file->'duplicate_exact'
                )
            )
          )
        )
        AND (SELECT count(DISTINCT file->>'content_hash') FROM jsonb_array_elements(batch.metadata #> '{preview,files}') AS manifest(file)) = 2
        AND NOT EXISTS (SELECT 1 FROM ipro.source_files WHERE batch_id = batch.id)
        AND NOT EXISTS (SELECT 1 FROM ipro.registry_versions WHERE batch_id = batch.id)
        AND NOT EXISTS (SELECT 1 FROM ipro.transactions WHERE batch_id = batch.id)
        AND NOT EXISTS (SELECT 1 FROM ipro.identity_resolutions WHERE batch_id = batch.id)
        AND NOT EXISTS (SELECT 1 FROM ipro.product_resolutions WHERE batch_id = batch.id)
        AND NOT EXISTS (SELECT 1 FROM ipro.calculation_runs WHERE batch_id = batch.id)
        AND NOT EXISTS (SELECT 1 FROM ipro.ingestion_errors WHERE batch_id = batch.id)
        AND NOT EXISTS (SELECT 1 FROM ipro.batch_activation_events WHERE rolled_back_batch_id = batch.id OR reactivated_batch_id = batch.id)
    )
  $candidate$ INTO candidate_requires_digest;
  IF NOT candidate_requires_digest THEN RETURN; END IF;
  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto'; END IF;
  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN RAISE EXCEPTION 'IPRO_020_PGCRYPTO_REQUIRED'; END IF;
  EXECUTE $attest$
    INSERT INTO ipro.import_recovery_events
      (id,batch_id,action,reason,actor,request_id,recovery_mode,recovery_version,manifest_hash,object_receipt,eligible_at)
    SELECT 'ipro_recovery_event_legacy_orphan_attestation_v1', batch.id,
           'LEGACY_ORPHAN_ATTESTED', 'ORPHANED_CONFIRMATION_AFTER_RUNTIME_TIMEOUT',
           session_user, NULL, 'LEGACY_ORPHAN_RECOVERY', 'ipro.orphan_recovery.v1',
           batch.metadata #>> '{preview,manifest_hash}', receipt.object_receipt, batch.updated_at
    FROM ipro.ingestion_batches batch
    CROSS JOIN LATERAL (
       SELECT encode(extensions.digest(convert_to(
        'ipro.orphan_recovery.object_receipt.v1' || E'\n' ||
        string_agg(object.content_hash, E'\n' ORDER BY object.created_at, object.id), 'UTF8'), 'sha256'), 'hex') AS object_receipt
      FROM ipro.import_source_objects object WHERE object.batch_id = batch.id
    ) receipt
     WHERE batch.id = 'import_597ce7ad1da070861b95fc7e'
       -- The stored hash is proof only if it is the exact Python preview
       -- serialization, not merely a well-formed SHA-looking value.
        AND encode(extensions.digest(convert_to(
         ipro.ipro_020_canonical_json(batch.metadata #> '{preview,files}'), 'UTF8'), 'sha256'), 'hex')
           = batch.metadata #>> '{preview,manifest_hash}'
      AND NOT EXISTS (SELECT 1 FROM ipro.import_recovery_events event WHERE event.id = 'ipro_recovery_event_legacy_orphan_attestation_v1')
      AND NOT EXISTS (
        SELECT 1 FROM ipro.import_source_objects object
         WHERE object.batch_id = batch.id AND encode(extensions.digest(object.object_bytes, 'sha256'), 'hex') <> object.content_hash
      )
  $attest$;
END;
$legacy_orphan_attestation$;
