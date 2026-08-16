import { createHash } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readMigrationFiles, runMigrations } from '../scripts/db-migrate.mjs';

const { Client } = pg;
const migrationsDir = resolve(process.cwd(), 'src/infrastructure/postgres/migrations');
const databaseUrl = process.env.IPRO_REPROCESSING_TEST_DATABASE_URL?.trim();
const describeDisposable = databaseUrl ? describe : describe.skip;
const orphanId = 'import_597ce7ad1da070861b95fc7e';
let disposableArcoAppRoleCreated = false;
let disposableOtherRuntimeRoleCreated = false;
const otherRuntimeRole = 'ipro_binding_other_runtime_test';

describeDisposable('IPRO migration 020 orphan recovery audit', () => {
  it('applies to the clean 016-019 schema without creating IPRO runtime relations or pgcrypto', async () => {
    await withDatabase(async (client) => {
      const { base, migration020, migration021 } = await prepareBase(client);
      expect(await runMigrations(client, base, silentLogger())).toEqual({ applied: 4, skipped: 0 });
      expect(await runMigrations(client, [migration020], silentLogger())).toEqual({ applied: 1, skipped: 0 });
      expect(await runMigrations(client, [migration021], silentLogger())).toEqual({ applied: 1, skipped: 0 });
      expect(await relationExists(client, 'ipro.import_source_objects')).toBe(false);
      expect(await relationExists(client, 'ipro.batch_activation_events')).toBe(false);
      expect((await client.query("SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'")).rowCount).toBe(0);
      expect(await eventCount(client)).toBe(0);
      expect(await runMigrations(client, [migration021], silentLogger())).toEqual({ applied: 0, skipped: 1 });
    });
  }, 60_000);

  it('repairs the canonical arco_app binding with a direct non-admin login', async () => {
    await withDatabase(async (client) => {
      const { base, migration020, migration021 } = await prepareBase(client);
      await runMigrations(client, base, silentLogger());
      await runMigrations(client, [migration020], silentLogger());
      await client.query("CREATE ROLE arco_app LOGIN PASSWORD 'arco-app-disposable-password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT");
      disposableArcoAppRoleCreated = true;

      await client.query('ALTER TABLE ipro.import_recovery_events OWNER TO arco_app');
      await client.query('ALTER TABLE ipro.import_recovery_runtime_role_contract OWNER TO arco_app');
      await client.query('ALTER FUNCTION ipro.append_import_recovery_outcome(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) OWNER TO arco_app');
      await client.query('ALTER FUNCTION ipro.register_import_recovery_runtime_role(NAME) OWNER TO arco_app');
      await client.query('ALTER FUNCTION ipro.prevent_import_recovery_event_mutation() OWNER TO arco_app');

      expect(await runMigrations(client, [migration021], silentLogger())).toEqual({ applied: 1, skipped: 0 });
      expect((await client.query('SELECT status, runtime_role_name FROM ipro.import_recovery_runtime_role_contract')).rows)
        .toEqual([{ status: 'VALIDATED', runtime_role_name: 'arco_app' }]);

      const protectedOwners = await client.query(`SELECT object_name, owner_name FROM (
          SELECT 'events' AS object_name, pg_get_userbyid(relowner) AS owner_name FROM pg_class WHERE oid = 'ipro.import_recovery_events'::regclass
          UNION ALL SELECT 'contract', pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'ipro.import_recovery_runtime_role_contract'::regclass
          UNION ALL SELECT 'writer', pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'ipro.append_import_recovery_outcome(text,text,text,text,text,text)'::regprocedure
          UNION ALL SELECT 'registrar', pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'ipro.register_import_recovery_runtime_role(name)'::regprocedure
          UNION ALL SELECT 'mutation_guard', pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'ipro.prevent_import_recovery_event_mutation()'::regprocedure
      ) AS owners ORDER BY object_name`);
      expect(protectedOwners.rows).toHaveLength(5);
      for (const owner of protectedOwners.rows) expect(owner.owner_name).not.toBe('arco_app');
      expect((await client.query(`SELECT proconfig FROM pg_proc
          WHERE oid = 'ipro.append_import_recovery_outcome(text,text,text,text,text,text)'::regprocedure`)).rows[0].proconfig)
        .toEqual(['search_path=pg_catalog, ipro']);
      expect((await client.query(`SELECT EXISTS (
          SELECT 1
          FROM pg_proc AS routine
          CROSS JOIN LATERAL aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS privilege
          WHERE routine.oid = 'ipro.append_import_recovery_outcome(text,text,text,text,text,text)'::regprocedure
            AND privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
      ) AS allowed`)).rows[0].allowed)
        .toBe(false);

      await client.query(`INSERT INTO ipro.ingestion_batches (
          id, status, source_system, idempotency_key, processing_fingerprint
      ) VALUES ('runtime-binding-batch', 'PROCESSING', 'integration_test', 'runtime-binding-key', 'runtime-binding-fingerprint')`);

      const runtime = new Client({ connectionString: runtimeDatabaseUrl(databaseUrl) });
      await runtime.connect();
      try {
        expect((await runtime.query('SELECT session_user, current_user')).rows[0])
          .toEqual({ session_user: 'arco_app', current_user: 'arco_app' });
        const privileges = (await runtime.query(`SELECT
            has_table_privilege(current_user, 'ipro.import_recovery_events', 'SELECT') AS audit_select,
            has_table_privilege(current_user, 'ipro.import_recovery_events', 'INSERT,UPDATE,DELETE') AS audit_dml,
            has_function_privilege(current_user, 'ipro.append_import_recovery_outcome(text,text,text,text,text,text)', 'EXECUTE') AS writer_execute,
            has_schema_privilege(current_user, 'ipro', 'CREATE') AS schema_create,
            (SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS role_admin,
          (SELECT count(*) FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS parent_roles`)).rows[0];
        expect(privileges).toEqual({
          audit_select: true, audit_dml: false, writer_execute: true, schema_create: false, role_admin: false, parent_roles: '0',
        });
        await expectPgError(() => runtime.query("INSERT INTO ipro.import_recovery_events (id,batch_id,action,reason,actor,recovery_mode,recovery_version,eligible_at) VALUES ('runtime-direct', 'runtime-binding-batch', 'RECOVERY_FAILED', 'DIRECT', 'arco_app', 'LEGACY_ORPHAN_RECOVERY', 'ipro.orphan_recovery.v1', now())"), '42501');
        await expectPgError(() => runtime.query("UPDATE ipro.import_recovery_events SET reason = 'DIRECT' WHERE id = 'runtime-direct'"), '42501');
        await expectPgError(() => runtime.query("DELETE FROM ipro.import_recovery_events WHERE id = 'runtime-direct'"), '42501');
        await expectPgError(() => runtime.query('CREATE TABLE ipro.runtime_escape_attempt (id INTEGER)'), '42501');
        await expectPgError(() => runtime.query('SET ROLE postgres'), '42501');
        await runtime.query("SELECT ipro.append_import_recovery_outcome('runtime-writer', 'runtime-binding-batch', 'RECOVERY_FAILED', 'WRITER_OK', 'arco_app', 'runtime-request')");
        expect((await runtime.query("SELECT count(*) FROM ipro.import_recovery_events WHERE id = 'runtime-writer'"))
          .rows[0].count).toBe('1');
      } finally {
        await runtime.end();
      }
    });
  }, 60_000);

  it('repairs least-privilege grants when arco_app is already the validated runtime', async () => {
    await withDatabase(async (client) => {
      const { base, migration020, migration021 } = await prepareBase(client);
      await runMigrations(client, base, silentLogger());
      await runMigrations(client, [migration020], silentLogger());
      await createDisposableArcoAppRole(client);
      await client.query("SELECT ipro.register_import_recovery_runtime_role('arco_app'::name)");
      await assignProtectedRecoveryObjectsToArcoApp(client);

      expect(await runMigrations(client, [migration021], silentLogger())).toEqual({ applied: 1, skipped: 0 });
      expect((await client.query('SELECT status, runtime_role_name FROM ipro.import_recovery_runtime_role_contract')).rows)
        .toEqual([{ status: 'VALIDATED', runtime_role_name: 'arco_app' }]);
      expect((await client.query(`SELECT
        has_schema_privilege('arco_app', 'ipro', 'USAGE') AS schema_usage,
        has_schema_privilege('arco_app', 'ipro', 'CREATE') AS schema_create,
        has_table_privilege('arco_app', 'ipro.import_recovery_events', 'SELECT') AS audit_select,
        has_table_privilege('arco_app', 'ipro.import_recovery_events', 'INSERT,UPDATE,DELETE') AS audit_dml,
        has_function_privilege('arco_app', 'ipro.append_import_recovery_outcome(text,text,text,text,text,text)', 'EXECUTE') AS writer_execute,
        has_function_privilege('arco_app', 'ipro.register_import_recovery_runtime_role(name)', 'EXECUTE') AS registrar_execute`)).rows[0])
        .toEqual({
          schema_usage: true, schema_create: false, audit_select: true, audit_dml: false,
          writer_execute: true, registrar_execute: false,
        });
      expect((await client.query(`SELECT pg_get_userbyid(relowner) AS owner_name
        FROM pg_class WHERE oid = 'ipro.import_recovery_events'::regclass`)).rows[0].owner_name)
        .not.toBe('arco_app');
    });
  }, 60_000);

  it('fails before changes when a different runtime role is already validated', async () => {
    await withDatabase(async (client) => {
      const { base, migration020, migration021 } = await prepareBase(client);
      await runMigrations(client, base, silentLogger());
      await runMigrations(client, [migration020], silentLogger());
      await createDisposableArcoAppRole(client);
      await client.query(`CREATE ROLE ${otherRuntimeRole} NOLOGIN`);
      disposableOtherRuntimeRoleCreated = true;
      await client.query(`SELECT ipro.register_import_recovery_runtime_role('${otherRuntimeRole}'::name)`);
      await assignProtectedRecoveryObjectsToArcoApp(client);

      const before = await protectedRecoverySnapshot(client);
      await expect(runMigrations(client, [migration021], silentLogger())).rejects
        .toThrow('IPRO_021_RUNTIME_ROLE_CONTRACT_CONFLICT');
      expect((await client.query("SELECT filename FROM schema_migrations WHERE filename = '021_ipro_runtime_role_binding_hardening.sql'"))
        .rowCount).toBe(0);
      expect((await client.query('SELECT status, runtime_role_name FROM ipro.import_recovery_runtime_role_contract')).rows)
        .toEqual([{ status: 'VALIDATED', runtime_role_name: otherRuntimeRole }]);
      expect(await protectedRecoverySnapshot(client)).toEqual(before);
      expect((await client.query(`SELECT pg_get_userbyid(relowner) AS owner_name
        FROM pg_class WHERE oid = 'ipro.import_recovery_events'::regclass`)).rows[0].owner_name)
        .toBe('arco_app');
    });
  }, 60_000);

  it('attests the exact IPRO runtime orphan and permits only the security-definer outcome writer', async () => {
    await withDatabase(async (client) => {
      const { base, migration020 } = await prepareBase(client);
      await runMigrations(client, base, silentLogger());
      await createIproRuntimeSchema(client);
      const { manifest, receipt } = await seedEligibleOrphan(client);
      await runMigrations(client, [migration020], silentLogger());

      const event = await client.query('SELECT * FROM ipro.import_recovery_events WHERE action=$1', ['LEGACY_ORPHAN_ATTESTED']);
      expect(event.rows).toHaveLength(1);
      expect(event.rows[0]).toMatchObject({
        batch_id: orphanId, action: 'LEGACY_ORPHAN_ATTESTED',
        reason: 'ORPHANED_CONFIRMATION_AFTER_RUNTIME_TIMEOUT', recovery_mode: 'LEGACY_ORPHAN_RECOVERY',
        recovery_version: 'ipro.orphan_recovery.v1', manifest_hash: manifest, object_receipt: receipt,
      });
      // This is the exact capability used by IPRO's _append_recovery_event().
      for (const action of ['RECOVERY_CLAIMED', 'RECOVERY_COMPLETED', 'RECOVERY_BLOCKED', 'RECOVERY_FAILED']) {
        await client.query(
          'SELECT ipro.append_import_recovery_outcome($1,$2,$3,$4,$5,$6)',
          [`event-${action}`, orphanId, action, action, 'ipro-runtime', 'request-020']
        );
      }
      expect(await eventCount(client)).toBe(5);
      await expectPgError(() => client.query("SELECT ipro.append_import_recovery_outcome('bad', 'import_597ce7ad1da070861b95fc7e', 'LEGACY_ORPHAN_ATTESTED', 'BAD', 'ipro-runtime', NULL)"), '22023');
      await expectPgError(() => client.query("UPDATE ipro.import_recovery_events SET reason = 'CHANGED'"), '55000');
      await expectPgError(() => client.query('DELETE FROM ipro.import_recovery_events'), '55000');
      expect((await client.query("SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'")).rowCount).toBe(1);
    });
  }, 60_000);

  it('rejects a partial or structurally incompatible runtime contract atomically', async () => {
    for (const setup of [
      'CREATE TABLE ipro.import_source_objects (id UUID PRIMARY KEY)',
      `ALTER TABLE ipro.ingestion_batches ADD COLUMN workflow_status UUID;
       CREATE TABLE ipro.import_source_objects (id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, source_file_id TEXT, file_name TEXT NOT NULL, content_type TEXT NOT NULL, content_hash TEXT NOT NULL, byte_size INTEGER NOT NULL, report_type TEXT NOT NULL, row_count INTEGER NOT NULL, object_bytes BYTEA NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
       CREATE TABLE ipro.batch_activation_events (id TEXT PRIMARY KEY, dataset_key TEXT NOT NULL, rolled_back_batch_id TEXT NOT NULL, reactivated_batch_id TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`
    ]) {
      await withDatabase(async (client) => {
        const { base, migration020 } = await prepareBase(client);
        await runMigrations(client, base, silentLogger());
        await client.query(setup);
        await expect(runMigrations(client, [migration020], silentLogger())).rejects.toThrow('IPRO_020_RUNTIME_CONTRACT_INVALID');
        expect(await relationExists(client, 'ipro.import_recovery_events')).toBe(false);
        expect((await client.query("SELECT filename FROM schema_migrations WHERE filename = '020_ipro_orphan_recovery_audit.sql'")).rowCount).toBe(0);
      });
    }
  }, 60_000);

  it('rejects an incompatible audit relation and binds only a least-privilege runtime role', async () => {
    await withDatabase(async (client) => {
      const { base, migration020 } = await prepareBase(client);
      await runMigrations(client, base, silentLogger());
      await client.query('CREATE TABLE ipro.import_recovery_events (id UUID PRIMARY KEY)');
      await expect(runMigrations(client, [migration020], silentLogger())).rejects.toThrow('IPRO_020_AUDIT_SCHEMA_INVALID');
      await clean(client); await client.query('CREATE SCHEMA ipro'); await runMigrations(client, base, silentLogger());
      await runMigrations(client, [migration020], silentLogger());
       await dropRuntimeRoleTestRoles(client);
       await client.query('CREATE ROLE ipro_orphan_runtime_test NOLOGIN');
       await client.query('CREATE ROLE ipro_orphan_privileged_test NOLOGIN CREATEDB');
       await client.query('CREATE ROLE ipro_orphan_audit_writer_test NOLOGIN');
       await client.query('CREATE ROLE ipro_orphan_inherited_audit_test NOLOGIN');
       await client.query('CREATE ROLE ipro_orphan_schema_creator_test NOLOGIN');
       await client.query('CREATE ROLE ipro_orphan_inherited_schema_test NOLOGIN');
       await client.query('CREATE ROLE ipro_orphan_public_test NOLOGIN');
       try {
         await expectPgError(() => client.query("SELECT ipro.register_import_recovery_runtime_role('ipro_orphan_privileged_test'::name)"), 'P0001', 'IPRO_020_RUNTIME_ROLE_PRIVILEGED');
         await client.query('GRANT INSERT ON ipro.import_recovery_events TO ipro_orphan_audit_writer_test');
         await client.query('GRANT ipro_orphan_audit_writer_test TO ipro_orphan_inherited_audit_test');
         await expectPgError(() => client.query("SELECT ipro.register_import_recovery_runtime_role('ipro_orphan_inherited_audit_test'::name)"), 'P0001', 'IPRO_020_RUNTIME_ROLE_PRIVILEGED');
         await client.query('GRANT CREATE ON SCHEMA ipro TO ipro_orphan_schema_creator_test');
         await client.query('GRANT ipro_orphan_schema_creator_test TO ipro_orphan_inherited_schema_test');
         await expectPgError(() => client.query("SELECT ipro.register_import_recovery_runtime_role('ipro_orphan_inherited_schema_test'::name)"), 'P0001', 'IPRO_020_RUNTIME_ROLE_PRIVILEGED');
         await client.query('GRANT DELETE ON ipro.import_recovery_events TO PUBLIC');
         await expectPgError(() => client.query("SELECT ipro.register_import_recovery_runtime_role('ipro_orphan_public_test'::name)"), 'P0001', 'IPRO_020_RUNTIME_ROLE_PRIVILEGED');
         await client.query('REVOKE DELETE ON ipro.import_recovery_events FROM PUBLIC');
         await client.query("SELECT ipro.register_import_recovery_runtime_role('ipro_orphan_runtime_test'::name)");
        expect((await client.query('SELECT status, runtime_role_name FROM ipro.import_recovery_runtime_role_contract')).rows)
          .toEqual([{ status: 'VALIDATED', runtime_role_name: 'ipro_orphan_runtime_test' }]);
        expect((await client.query("SELECT has_table_privilege('ipro_orphan_runtime_test', 'ipro.import_recovery_events', 'SELECT') AS allowed")).rows[0].allowed).toBe(true);
        expect((await client.query("SELECT has_table_privilege('ipro_orphan_runtime_test', 'ipro.import_recovery_events', 'INSERT,UPDATE,DELETE') AS allowed")).rows[0].allowed).toBe(false);
        expect((await client.query("SELECT has_function_privilege('ipro_orphan_runtime_test', 'ipro.append_import_recovery_outcome(text,text,text,text,text,text)', 'EXECUTE') AS allowed")).rows[0].allowed).toBe(true);
        await client.query('SET ROLE ipro_orphan_runtime_test');
        await expectPgError(() => client.query("INSERT INTO ipro.import_recovery_events (id,batch_id,action,reason,actor,recovery_mode,recovery_version,eligible_at) VALUES ('direct', 'import_x', 'RECOVERY_FAILED', 'DIRECT', 'runtime', 'LEGACY_ORPHAN_RECOVERY', 'ipro.orphan_recovery.v1', now())"), '42501');
        await expectPgError(() => client.query('CREATE TABLE ipro.not_allowed (id int)'), '42501');
        await client.query('RESET ROLE');
      } finally {
        await client.query('RESET ROLE');
        await client.query('DROP SCHEMA IF EXISTS ipro CASCADE');
         await dropRuntimeRoleTestRoles(client);
      }
    });
  }, 60_000);

  it('does not attest when an exact orphan condition is violated', async () => {
    for (const mutate of [
      "UPDATE ipro.ingestion_batches SET workflow_status = 'CONFIRMADO' WHERE id = 'import_597ce7ad1da070861b95fc7e'",
      "UPDATE ipro.import_source_objects SET status = 'PROCESSED' WHERE id = 'object-a'",
      "UPDATE ipro.import_source_objects SET object_bytes = convert_to('tampered', 'UTF8') WHERE id = 'object-a'",
      "UPDATE ipro.ingestion_batches SET metadata=jsonb_set(metadata, '{preview,manifest_hash}', '\"0000000000000000000000000000000000000000000000000000000000000000\"') WHERE id = 'import_597ce7ad1da070861b95fc7e'",
      "INSERT INTO ipro.source_files (id, batch_id, file_name, file_kind, content_hash, status) VALUES ('effect', 'import_597ce7ad1da070861b95fc7e', 'effect.csv', 'test', 'effect-hash', 'PARSED')",
    ]) await withDatabase(async (client) => {
      const { base, migration020 } = await prepareBase(client);
      await runMigrations(client, base, silentLogger()); await createIproRuntimeSchema(client); await seedEligibleOrphan(client);
      await client.query(mutate); await runMigrations(client, [migration020], silentLogger());
      expect(await eventCount(client)).toBe(0);
    });
  }, 60_000);
});

async function prepareBase(client) {
  await assertNoUnmanagedArcoAppRole(client);
  await clean(client); await client.query('CREATE SCHEMA ipro');
  const migrations = await readMigrationFiles(migrationsDir);
  const base = migrations.filter((migration) => ['016_ipro_foundation.sql', '017_ipro_canonical_product_gate.sql', '018_ipro_product_alias_represented_scope.sql', '019_ipro_controlled_reprocessing.sql'].includes(migration.filename));
  return {
    base,
    migration020: migrations.find((migration) => migration.filename === '020_ipro_orphan_recovery_audit.sql'),
    migration021: migrations.find((migration) => migration.filename === '021_ipro_runtime_role_binding_hardening.sql'),
  };
}
async function createDisposableArcoAppRole(client) {
  await client.query("CREATE ROLE arco_app LOGIN PASSWORD 'arco-app-disposable-password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT");
  disposableArcoAppRoleCreated = true;
}
async function assignProtectedRecoveryObjectsToArcoApp(client) {
  await client.query('ALTER TABLE ipro.import_recovery_events OWNER TO arco_app');
  await client.query('ALTER TABLE ipro.import_recovery_runtime_role_contract OWNER TO arco_app');
  await client.query('ALTER FUNCTION ipro.append_import_recovery_outcome(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) OWNER TO arco_app');
  await client.query('ALTER FUNCTION ipro.register_import_recovery_runtime_role(NAME) OWNER TO arco_app');
  await client.query('ALTER FUNCTION ipro.prevent_import_recovery_event_mutation() OWNER TO arco_app');
}
async function protectedRecoverySnapshot(client) {
  return (await client.query(`SELECT
    (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'ipro.import_recovery_events'::regclass) AS events_owner,
    (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'ipro.import_recovery_runtime_role_contract'::regclass) AS contract_owner,
    (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'ipro.append_import_recovery_outcome(text,text,text,text,text,text)'::regprocedure) AS writer_owner,
    (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'ipro.register_import_recovery_runtime_role(name)'::regprocedure) AS registrar_owner,
    (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'ipro.prevent_import_recovery_event_mutation()'::regprocedure) AS mutation_guard_owner,
    (SELECT relacl::text FROM pg_class WHERE oid = 'ipro.import_recovery_events'::regclass) AS events_acl,
    (SELECT relacl::text FROM pg_class WHERE oid = 'ipro.import_recovery_runtime_role_contract'::regclass) AS contract_acl,
    (SELECT proacl::text FROM pg_proc WHERE oid = 'ipro.append_import_recovery_outcome(text,text,text,text,text,text)'::regprocedure) AS writer_acl,
    (SELECT proacl::text FROM pg_proc WHERE oid = 'ipro.register_import_recovery_runtime_role(name)'::regprocedure) AS registrar_acl,
    (SELECT proacl::text FROM pg_proc WHERE oid = 'ipro.prevent_import_recovery_event_mutation()'::regprocedure) AS mutation_guard_acl,
    (SELECT nspacl::text FROM pg_namespace WHERE nspname = 'ipro') AS schema_acl`)).rows;
}
async function createIproRuntimeSchema(client) {
  await client.query(`ALTER TABLE ipro.ingestion_batches ADD COLUMN workflow_status TEXT, ADD COLUMN confirmation_idempotency_key TEXT;
    CREATE TABLE ipro.import_source_objects (
      id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id), source_file_id TEXT REFERENCES ipro.source_files(id),
      file_name TEXT NOT NULL, content_type TEXT NOT NULL, content_hash TEXT NOT NULL, byte_size INTEGER NOT NULL, report_type TEXT NOT NULL, row_count INTEGER NOT NULL DEFAULT 0,
      object_bytes BYTEA NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    ); CREATE TABLE ipro.batch_activation_events (
      id TEXT PRIMARY KEY, dataset_key TEXT NOT NULL, rolled_back_batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id), reactivated_batch_id TEXT NOT NULL REFERENCES ipro.ingestion_batches(id), actor TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}
async function seedEligibleOrphan(client) {
  const first = sha256('object-a'), second = sha256('object-b');
  const files = [manifestFile('object-a.xlsx', first, 8, 'transactions', 10), manifestFile('object-b.xlsx', second, 8, 'customer_registry', 2)];
  // ProductionImportService uses json.dumps(..., ensure_ascii=True,
  // sort_keys=True) with its default comma/colon spaces.
  const manifest = sha256(pythonCanonicalJson(files));
  await client.query(`INSERT INTO ipro.ingestion_batches (id,status,workflow_status,source_system,idempotency_key,processing_fingerprint,data_scope,input_file_count,confirmation_idempotency_key,metadata)
    VALUES ($1,'PROCESSING','AGUARDANDO_CONFIRMACAO','ipro_production_upload','orphan-key','orphan-fingerprint','operational',2,'confirm-legacy', $2::jsonb)`, [orphanId, JSON.stringify({ preview: { manifest_hash: manifest, files } })]);
  for (const [id, name, hash, type, rows, timestamp] of [['object-a','object-a.xlsx',first,'transactions',10,'2026-01-01T00:00:00Z'], ['object-b','object-b.xlsx',second,'customer_registry',2,'2026-01-01T00:00:01Z']]) {
    const metadata = { recognized_columns: [], missing_columns: [], period_start: null, period_end: null, duplicate_exact: 0 };
    await client.query(`INSERT INTO ipro.import_source_objects (id,batch_id,file_name,content_type,content_hash,byte_size,report_type,row_count,object_bytes,metadata,status,created_at)
      VALUES ($1,$2,$3,'application/octet-stream',$4,8,$5,$6,convert_to($1,'UTF8'),$7::jsonb,'STAGED',$8)`, [id, orphanId, name, hash, type, rows, JSON.stringify(metadata), timestamp]);
  }
  return { manifest, receipt: sha256(`ipro.orphan_recovery.object_receipt.v1\n${first}\n${second}`) };
}
function manifestFile(file_name, content_hash, byte_size, report_type, row_count) { return { file_name, content_hash, byte_size, report_type, row_count, recognized_columns: [], missing_columns: [], period_start: null, period_end: null, duplicate_exact: 0, source_rows: row_count, accepted_rows: row_count, rejected_rows: 0, duplicate_rows: 0, collapsed_rows: 0, unique_records: row_count }; }
async function withDatabase(test) { assertDisposableUrl(databaseUrl); const client = new Client({ connectionString: databaseUrl }); await client.connect(); try { await test(client); } finally { await clean(client); await client.end(); } }
async function clean(client) {
  await client.query('DROP SCHEMA IF EXISTS ipro CASCADE');
  await client.query('DROP TABLE IF EXISTS schema_migrations');
  await client.query('DROP EXTENSION IF EXISTS pgcrypto');
  if (disposableArcoAppRoleCreated) {
    await client.query('DROP ROLE IF EXISTS arco_app');
    disposableArcoAppRoleCreated = false;
  }
  if (disposableOtherRuntimeRoleCreated) {
    await client.query(`DROP ROLE IF EXISTS ${otherRuntimeRole}`);
    disposableOtherRuntimeRoleCreated = false;
  }
}
async function relationExists(client, relation) { return (await client.query('SELECT to_regclass($1) AS relation', [relation])).rows[0].relation !== null; }
async function eventCount(client) { return Number((await client.query('SELECT count(*) FROM ipro.import_recovery_events')).rows[0].count); }
async function expectPgError(action, code, message) { try { await action(); throw new Error('Expected PostgreSQL error'); } catch (error) { if (error?.code !== code) throw error; expect(error?.code).toBe(code); if (message) expect(error?.message).toContain(message); } }
async function dropRuntimeRoleTestRoles(client) {
  for (const role of [
    'ipro_orphan_runtime_test', 'ipro_orphan_privileged_test',
    'ipro_orphan_inherited_audit_test', 'ipro_orphan_audit_writer_test',
    'ipro_orphan_inherited_schema_test', 'ipro_orphan_schema_creator_test',
    'ipro_orphan_public_test',
  ]) await client.query(`DROP ROLE IF EXISTS ${role}`);
}
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function pythonCanonicalJson(value) {
  const sort = (item) => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])])) : item;
  return JSON.stringify(sort(value)).replaceAll(',', ', ').replaceAll(':', ': ');
}
function silentLogger() { return { log: () => {} }; }
function runtimeDatabaseUrl(value) { const url = new URL(value); url.username = 'arco_app'; url.password = 'arco-app-disposable-password'; return url.toString(); }
async function assertNoUnmanagedArcoAppRole(client) {
  if ((await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'arco_app'")).rowCount !== 0) {
    throw new Error('IPRO integration test requires arco_app to be absent before creating its disposable runtime role.');
  }
}
function assertDisposableUrl(value) { if (!value) throw new Error('IPRO_REPROCESSING_TEST_DATABASE_URL is required.'); const url = new URL(value); const database = decodeURIComponent(url.pathname.slice(1)); if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname) || !/^ipro_reprocessing_(?:test|ci)(?:_[a-z0-9_-]+)?$/.test(database)) throw new Error('Integration test requires a local disposable ipro_reprocessing_test/ci database.'); }
