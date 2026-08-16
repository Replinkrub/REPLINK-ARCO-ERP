-- Migration 020 was applied by the application runtime in an earlier
-- deployment.  Keep that immutable migration intact, but return the recovery
-- audit objects to the current owner of the IPRO schema before binding the
-- known non-admin runtime role.
DO $ipro_runtime_role_binding$
DECLARE
  controlled_owner NAME;
  caller_is_superuser BOOLEAN;
  protected_object RECORD;
BEGIN
  -- An ARCO-only clean schema has no application runtime role.  There is
  -- nothing to bind or repair in that case, and this migration remains safe.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arco_app') THEN
    RETURN;
  END IF;

  SELECT pg_get_userbyid(namespace.nspowner)::NAME
    INTO controlled_owner
    FROM pg_namespace AS namespace
   WHERE namespace.nspname = 'ipro';

  IF controlled_owner IS NULL THEN
    RAISE EXCEPTION 'IPRO_021_IPRO_SCHEMA_MISSING';
  END IF;

  IF controlled_owner = 'arco_app'::NAME THEN
    RAISE EXCEPTION 'IPRO_021_RUNTIME_CANNOT_CONTROL_IPRO_SCHEMA';
  END IF;

  -- Fail before changing ACLs when this runner cannot atomically repair every
  -- protected object.  PostgreSQL also requires a non-superuser owner-change
  -- caller to be able to assume the target owner role.
  SELECT roles.rolsuper
    INTO caller_is_superuser
    FROM pg_roles AS roles
   WHERE roles.rolname = current_user;

  IF NOT caller_is_superuser
     AND NOT pg_has_role(current_user, controlled_owner, 'MEMBER') THEN
    RAISE EXCEPTION
      'IPRO_021_OWNER_TRANSFER_NOT_AUTHORIZED: current_user % cannot assume controlled owner %',
      current_user, controlled_owner;
  END IF;

  FOR protected_object IN
    SELECT object_name, owner_oid
    FROM (
      SELECT 'ipro.import_recovery_events'::TEXT AS object_name, relation.relowner AS owner_oid
      FROM pg_class AS relation
      WHERE relation.oid = 'ipro.import_recovery_events'::regclass
      UNION ALL
      SELECT 'ipro.import_recovery_runtime_role_contract', relation.relowner
      FROM pg_class AS relation
      WHERE relation.oid = 'ipro.import_recovery_runtime_role_contract'::regclass
      UNION ALL
      SELECT 'ipro.append_import_recovery_outcome', routine.proowner
      FROM pg_proc AS routine
      WHERE routine.oid = 'ipro.append_import_recovery_outcome(text,text,text,text,text,text)'::regprocedure
      UNION ALL
      SELECT 'ipro.register_import_recovery_runtime_role', routine.proowner
      FROM pg_proc AS routine
      WHERE routine.oid = 'ipro.register_import_recovery_runtime_role(name)'::regprocedure
      UNION ALL
      SELECT 'ipro.prevent_import_recovery_event_mutation', routine.proowner
      FROM pg_proc AS routine
      WHERE routine.oid = 'ipro.prevent_import_recovery_event_mutation()'::regprocedure
    ) AS protected_objects
  LOOP
    IF NOT caller_is_superuser
       AND NOT pg_has_role(current_user, protected_object.owner_oid, 'MEMBER') THEN
      RAISE EXCEPTION
        'IPRO_021_OWNER_TRANSFER_NOT_AUTHORIZED: current_user % cannot transfer protected object %',
        current_user, protected_object.object_name;
    END IF;
  END LOOP;

  IF (SELECT COUNT(*) FROM pg_class AS relation WHERE relation.oid IN (
        'ipro.import_recovery_events'::regclass,
        'ipro.import_recovery_runtime_role_contract'::regclass
      )) <> 2
     OR (SELECT COUNT(*) FROM pg_proc AS routine WHERE routine.oid IN (
        'ipro.append_import_recovery_outcome(text,text,text,text,text,text)'::regprocedure,
        'ipro.register_import_recovery_runtime_role(name)'::regprocedure,
        'ipro.prevent_import_recovery_event_mutation()'::regprocedure
      )) <> 3 THEN
    RAISE EXCEPTION 'IPRO_021_PROTECTED_OBJECT_MISSING';
  END IF;

  EXECUTE format('ALTER TABLE ipro.import_recovery_events OWNER TO %I', controlled_owner);
  EXECUTE format('ALTER TABLE ipro.import_recovery_runtime_role_contract OWNER TO %I', controlled_owner);
  EXECUTE format('ALTER FUNCTION ipro.append_import_recovery_outcome(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) OWNER TO %I', controlled_owner);
  EXECUTE format('ALTER FUNCTION ipro.register_import_recovery_runtime_role(NAME) OWNER TO %I', controlled_owner);
  EXECUTE format('ALTER FUNCTION ipro.prevent_import_recovery_event_mutation() OWNER TO %I', controlled_owner);

  REVOKE ALL PRIVILEGES ON TABLE ipro.import_recovery_events FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON TABLE ipro.import_recovery_runtime_role_contract FROM PUBLIC;
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE ipro.import_recovery_events FROM arco_app';
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE ipro.import_recovery_runtime_role_contract FROM arco_app';

  REVOKE ALL PRIVILEGES ON FUNCTION ipro.append_import_recovery_outcome(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON FUNCTION ipro.register_import_recovery_runtime_role(NAME) FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON FUNCTION ipro.prevent_import_recovery_event_mutation() FROM PUBLIC;
  EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION ipro.append_import_recovery_outcome(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM arco_app';
  EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION ipro.register_import_recovery_runtime_role(NAME) FROM arco_app';
  EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION ipro.prevent_import_recovery_event_mutation() FROM arco_app';
  EXECUTE 'REVOKE CREATE ON SCHEMA ipro FROM arco_app';

  -- The immutable 020 registrar is the sole grant path for the runtime: it
  -- verifies the role and grants only schema usage, audit SELECT, and writer
  -- EXECUTE.  It does not grant direct audit DML or schema CREATE.
  PERFORM ipro.register_import_recovery_runtime_role('arco_app'::NAME);
END;
$ipro_runtime_role_binding$;
