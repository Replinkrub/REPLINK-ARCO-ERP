import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { calculateChecksum, readMigrationFiles, runMigrations } from '../scripts/db-migrate.mjs';

const migrationsDir = resolve(process.cwd(), 'src/infrastructure/postgres/migrations');

class FakeMigrationClient {
  constructor() {
    this.applied = new Map();
    this.queries = [];
  }

  async query(text, values = []) {
    this.queries.push({ text, values });

    if (text.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) {
      return result([]);
    }

    if (text.startsWith('SELECT filename, checksum FROM schema_migrations')) {
      const filename = values[0];
      const checksum = this.applied.get(filename);
      return checksum ? result([{ filename, checksum }]) : result([]);
    }

    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return result([]);
    }

    if (text.startsWith('INSERT INTO schema_migrations')) {
      const [filename, checksum] = values;
      this.applied.set(filename, checksum);
      return result([]);
    }

    if (text.includes('FAIL_MIGRATION')) {
      throw new Error('migration failed');
    }

    return result([]);
  }
}

function result(rows) {
  return { rows, rowCount: rows.length };
}

function silentLogger() {
  const messages = [];
  return {
    messages,
    log: (message) => messages.push(message),
  };
}

describe('db migration runner', () => {
  it('applies an unapplied migration and records its checksum', async () => {
    const client = new FakeMigrationClient();
    const logger = silentLogger();
    const migration = { filename: '001_init.sql', sql: 'CREATE TABLE example (id TEXT);' };

    const summary = await runMigrations(client, [migration], logger);

    expect(summary).toEqual({ applied: 1, skipped: 0 });
    expect(client.applied.get('001_init.sql')).toBe(calculateChecksum(migration.sql));
    expect(logger.messages).toContain('Applied migration: 001_init.sql');
    expect(client.queries[0]?.text).toBe('SELECT pg_advisory_lock($1)');
    expect(client.queries.at(-1)?.text).toBe('SELECT pg_advisory_unlock($1)');
  });

  it('skips an already applied migration with the same checksum', async () => {
    const client = new FakeMigrationClient();
    const logger = silentLogger();
    const migration = { filename: '001_init.sql', sql: 'CREATE TABLE example (id TEXT);' };
    client.applied.set(migration.filename, calculateChecksum(migration.sql));

    const summary = await runMigrations(client, [migration], logger);

    expect(summary).toEqual({ applied: 0, skipped: 1 });
    expect(logger.messages).toContain('Skipped migration: 001_init.sql');
    expect(client.queries.some((query) => query.text === migration.sql)).toBe(false);
    expect(client.queries[0]?.text).toBe('SELECT pg_advisory_lock($1)');
    expect(client.queries.at(-1)?.text).toBe('SELECT pg_advisory_unlock($1)');
  });

  it('blocks when an applied filename has a different checksum', async () => {
    const client = new FakeMigrationClient();
    const migration = { filename: '001_init.sql', sql: 'CREATE TABLE changed (id TEXT);' };
    client.applied.set(migration.filename, calculateChecksum('CREATE TABLE original (id TEXT);'));

    await expect(runMigrations(client, [migration], silentLogger())).rejects.toThrow(
      'MIGRATION_CHECKSUM_MISMATCH: 001_init.sql'
    );
    expect(client.queries.some((query) => query.text === migration.sql)).toBe(false);
    expect(client.queries[0]?.text).toBe('SELECT pg_advisory_lock($1)');
    expect(client.queries.at(-1)?.text).toBe('SELECT pg_advisory_unlock($1)');
  });

  it('does not record a migration when applying it fails', async () => {
    const client = new FakeMigrationClient();
    const migration = { filename: '002_fail.sql', sql: 'FAIL_MIGRATION;' };

    await expect(runMigrations(client, [migration], silentLogger())).rejects.toThrow('migration failed');

    expect(client.applied.has('002_fail.sql')).toBe(false);
    expect(client.queries.some((query) => query.text === 'ROLLBACK')).toBe(true);
    expect(client.queries[0]?.text).toBe('SELECT pg_advisory_lock($1)');
    expect(client.queries.at(-1)?.text).toBe('SELECT pg_advisory_unlock($1)');
  });
});

describe('IPRO controlled reprocessing migration contract', () => {
  it('loads migration 020 immediately after 019', async () => {
    const filenames = (await readMigrationFiles(migrationsDir)).map(({ filename }) => filename);
    expect(filenames.indexOf('020_ipro_orphan_recovery_audit.sql')).toBe(
      filenames.indexOf('019_ipro_controlled_reprocessing.sql') + 1
    );
  });

  it('keeps the ARCO-owned audit contract compatible with IPRO and defers runtime role grants', async () => {
    const migration020 = (await readMigrationFiles(migrationsDir)).find(
      ({ filename }) => filename === '020_ipro_orphan_recovery_audit.sql'
    );
    expect(migration020.sql).toContain('CREATE TABLE IF NOT EXISTS ipro.import_recovery_events');
    for (const column of [
      'action TEXT NOT NULL', 'reason TEXT NOT NULL', 'actor TEXT NOT NULL', 'request_id TEXT',
      'recovery_mode TEXT NOT NULL', 'recovery_version TEXT NOT NULL', 'manifest_hash TEXT',
      'object_receipt TEXT', 'eligible_at TIMESTAMPTZ NOT NULL',
    ]) expect(migration020.sql).toContain(column);
    for (const action of [
      'LEGACY_ORPHAN_ATTESTED', 'RECOVERY_CLAIMED', 'RECOVERY_COMPLETED',
      'RECOVERY_BLOCKED', 'RECOVERY_FAILED',
    ]) expect(migration020.sql).toContain(`'${action}'`);
    expect(migration020.sql).toContain('IPRO_IMPORT_RECOVERY_EVENT_IMMUTABLE');
    expect(migration020.sql).toContain('import_recovery_runtime_role_contract');
    expect(migration020.sql).toContain('register_import_recovery_runtime_role');
    expect(migration020.sql).toContain('REVOKE ALL PRIVILEGES ON FUNCTION ipro.register_import_recovery_runtime_role(NAME) FROM PUBLIC;');
    expect(migration020.sql).not.toMatch(/^GRANT\s+/im);
    expect(migration020.sql).not.toMatch(/CREATE TABLE IF NOT EXISTS ipro\.(?:import_source_objects|batch_activation_events)/i);
    expect(migration020.sql).not.toMatch(/ALTER TABLE ipro\.ingestion_batches\s+ADD COLUMN.*workflow_status/i);
  });

  it('loads migration 019 immediately after 018 and preserves checksum idempotency', async () => {
    const migrations = await readMigrationFiles(migrationsDir);
    const filenames = migrations.map((migration) => migration.filename);
    const migration018Index = filenames.indexOf('018_ipro_product_alias_represented_scope.sql');
    const migration019Index = filenames.indexOf('019_ipro_controlled_reprocessing.sql');
    const migration019 = migrations[migration019Index];

    expect(migration018Index).toBeGreaterThanOrEqual(0);
    expect(migration019Index).toBe(migration018Index + 1);
    expect(migration019).toBeDefined();

    const client = new FakeMigrationClient();
    const firstRun = await runMigrations(client, [migration019], silentLogger());
    const secondRun = await runMigrations(client, [migration019], silentLogger());

    expect(firstRun).toEqual({ applied: 1, skipped: 0 });
    expect(secondRun).toEqual({ applied: 0, skipped: 1 });
    expect(client.applied.get(migration019.filename)).toBe(calculateChecksum(migration019.sql));
  });

  it('replaces global transaction uniqueness with batch-scoped generation uniqueness', async () => {
    const migrations = await readMigrationFiles(migrationsDir);
    const foundation = migrations.find((migration) => migration.filename === '016_ipro_foundation.sql');
    const migration019 = migrations.find(
      (migration) => migration.filename === '019_ipro_controlled_reprocessing.sql'
    );
    const sql = migration019.sql;

    expect(foundation.sql).toMatch(/CREATE TABLE IF NOT EXISTS ipro\.transactions \(\s*id TEXT PRIMARY KEY/);
    expect(foundation.sql).toContain('idempotency_key TEXT NOT NULL UNIQUE');
    expect(sql).toContain("c.conrelid = 'ipro.transactions'::regclass");
    expect(sql).toContain("c.contype = 'u'");
    expect(sql).toContain("ARRAY['source_file_id', 'source_row_hash']::TEXT[]");
    expect(sql).toContain("ARRAY['business_event_hash']::TEXT[]");
    expect(sql).toContain('DROP CONSTRAINT %I');
    expect(sql).toMatch(
      /ON ipro\.transactions\s*\(batch_id, source_file_id, source_row_hash\)/
    );
    expect(sql).toMatch(/ON ipro\.transactions\s*\(batch_id, business_event_hash\)/);
    expect(sql).not.toMatch(/DROP\s+CONSTRAINT\s+\S*pkey/i);
    expect(sql).not.toMatch(/(?:DROP|ALTER)\s+COLUMN\s+id\b/i);
  });

  it('adds a required non-blank processing fingerprint after deterministic backfill', async () => {
    const migrations = await readMigrationFiles(migrationsDir);
    const migration019 = migrations.find(
      (migration) => migration.filename === '019_ipro_controlled_reprocessing.sql'
    );
    const sql = migration019.sql;
    const backfillPosition = sql.indexOf('UPDATE ipro.ingestion_batches');
    const notNullPosition = sql.indexOf('ALTER COLUMN processing_fingerprint SET NOT NULL');
    const checkPosition = sql.indexOf('CHECK (BTRIM(processing_fingerprint) <> \'\')');

    expect(sql).toMatch(
      /ALTER TABLE ipro\.ingestion_batches\s+ADD COLUMN IF NOT EXISTS processing_fingerprint TEXT;/
    );
    expect(sql).toContain("NULLIF(BTRIM(metadata->>'processing_fingerprint'), '')");
    expect(sql).toContain("'legacy:idempotency:' || idempotency_key");
    expect(sql).toMatch(
      /WHERE processing_fingerprint IS NULL\s+OR BTRIM\(processing_fingerprint\) = '';/
    );
    expect(sql).toContain('ipro_ingestion_batches_processing_fingerprint_nonempty_ck');
    expect(backfillPosition).toBeGreaterThanOrEqual(0);
    expect(notNullPosition).toBeGreaterThan(backfillPosition);
    expect(checkPosition).toBeGreaterThan(notNullPosition);
    expect(sql).not.toMatch(/processing_fingerprint\s+TEXT\s+(?:NOT NULL\s+)?DEFAULT/i);
    expect(sql).not.toMatch(/(?:UNIQUE|INDEX)[\s\S]{0,100}processing_fingerprint/i);
  });

  it('adds stable represented scope without creating or linking a represented master', async () => {
    const migrations = await readMigrationFiles(migrationsDir);
    const migration019 = migrations.find(
      (migration) => migration.filename === '019_ipro_controlled_reprocessing.sql'
    );
    const sql = migration019.sql;

    for (const table of ['product_entities', 'product_aliases', 'product_resolutions']) {
      expect(sql).toMatch(
        new RegExp(
          `ALTER TABLE ipro\\.${table}\\s+ADD COLUMN IF NOT EXISTS represented_company_id TEXT;`
        )
      );
      expect(sql).toContain(`ipro_${table}_represented_company_id_canonical_ck`);
    }
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION ipro.canonical_represented_company_id(value TEXT)'
    );
    expect(sql).toContain("REGEXP_REPLACE(value, '^[[:space:][:cntrl:]]+', '')");
    expect(sql).toContain("'[[:space:][:cntrl:]]+$'");
    expect(sql).toContain("normalized_value ~ '[[:space:][:cntrl:]]'");
    expect(
      sql.match(/represented_company_id ~ '\^\[\[:space:\]\[:cntrl:\]\]\*\$'/g)
    ).toHaveLength(3);
    expect(
      sql.match(
        /SET represented_company_id = ipro\.canonical_represented_company_id\(represented_company_id\)/g
      )
    ).toHaveLength(3);
    expect(
      sql.match(
        /ipro\.canonical_represented_company_id\(represented_company_id\) IS NOT NULL/g
      )
    ).toHaveLength(6);
    expect(
      sql.match(
        /AND represented_company_id = ipro\.canonical_represented_company_id\(represented_company_id\)/g
      )
    ).toHaveLength(3);
    expect(sql).toContain("metadata->>'represented_company_stable_id'");
    expect(sql).toMatch(
      /UPDATE ipro\.product_aliases AS pa[\s\S]*FROM ipro\.product_entities AS pe[\s\S]*pa\.product_entity_id = pe\.id/
    );
    expect(sql).not.toMatch(/REFERENCES\s+(?:\w+\.)?represented_companies/i);
    expect(sql).not.toMatch(/CREATE TABLE[\s\S]*represented_compan/i);
  });

  it('preflights stable-scope collisions before replacing legacy indexes', async () => {
    const migrations = await readMigrationFiles(migrationsDir);
    const migration019 = migrations.find(
      (migration) => migration.filename === '019_ipro_controlled_reprocessing.sql'
    );
    const sql = migration019.sql;
    const preflightPosition = sql.indexOf('IPRO_019_STABLE_SCOPE_COLLISION');
    const firstDropPosition = sql.indexOf('DROP INDEX IF EXISTS');

    expect(sql).toContain("IPRO_019_STABLE_SCOPE_COLLISION: product_entities sku");
    expect(sql).toContain("IPRO_019_STABLE_SCOPE_COLLISION: product_entities product_code");
    expect(sql).toContain("IPRO_019_STABLE_SCOPE_COLLISION: product_aliases lookup");
    expect(sql).toMatch(
      /GROUP BY sku, COALESCE\(ipro\.canonical_represented_company_id\(represented_company_id\), represented_company, ''\)/
    );
    expect(sql).toMatch(
      /GROUP BY product_code, COALESCE\(ipro\.canonical_represented_company_id\(represented_company_id\), represented_company, ''\)/
    );
    expect(sql).toMatch(
      /GROUP BY[\s\S]*COALESCE\(ipro\.canonical_represented_company_id\(represented_company_id\), represented_company, ''\),[\s\S]*COALESCE\(normalized_value, ''\)/
    );
    expect(preflightPosition).toBeGreaterThanOrEqual(0);
    expect(firstDropPosition).toBeGreaterThan(preflightPosition);
  });

  it('replaces represented display-scope indexes with stable-id-first uniqueness', async () => {
    const migrations = await readMigrationFiles(migrationsDir);
    const migration019 = migrations.find(
      (migration) => migration.filename === '019_ipro_controlled_reprocessing.sql'
    );
    const sql = migration019.sql;

    expect(sql).toContain('DROP INDEX IF EXISTS ipro.ux_ipro_product_entities_sku_represented;');
    expect(sql).toContain('DROP INDEX IF EXISTS ipro.ux_ipro_product_entities_code_represented;');
    expect(sql).toContain('DROP INDEX IF EXISTS ipro.ux_ipro_product_aliases_lookup_represented;');
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX ux_ipro_product_entities_sku_represented[\s\S]*sku,[\s\S]*COALESCE\(ipro\.canonical_represented_company_id\(represented_company_id\), represented_company, ''\)[\s\S]*WHERE sku IS NOT NULL;/
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX ux_ipro_product_entities_code_represented[\s\S]*product_code,[\s\S]*COALESCE\(ipro\.canonical_represented_company_id\(represented_company_id\), represented_company, ''\)[\s\S]*WHERE product_code IS NOT NULL;/
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX ux_ipro_product_aliases_lookup_represented[\s\S]*COALESCE\(ipro\.canonical_represented_company_id\(represented_company_id\), represented_company, ''\)/
    );
  });

  it('keeps immutable source-file deduplication and does not change customer models', async () => {
    const migrations = await readMigrationFiles(migrationsDir);
    const foundation = migrations.find((migration) => migration.filename === '016_ipro_foundation.sql');
    const migration019 = migrations.find(
      (migration) => migration.filename === '019_ipro_controlled_reprocessing.sql'
    );

    expect(foundation.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS ipro\.source_files[\s\S]*?UNIQUE \(content_hash\)/
    );
    expect(migration019.sql).not.toMatch(/ALTER TABLE ipro\.source_files/i);
    expect(migration019.sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) ipro\.source_files/i);
    expect(migration019.sql).not.toMatch(/(?:CREATE TABLE|REFERENCES)[\s\S]*represented_companies/i);
    expect(migration019.sql).not.toMatch(/(?:CREATE|DROP)\s+TABLE/i);
    expect(migration019.sql).not.toMatch(/ipro\.customer_/i);
  });

  it('keeps the active view READY-only with all canonical eligibility filters', async () => {
    const migrations = await readMigrationFiles(migrationsDir);
    const migration017 = migrations.find(
      (migration) => migration.filename === '017_ipro_canonical_product_gate.sql'
    );
    const migration019 = migrations.find(
      (migration) => migration.filename === '019_ipro_controlled_reprocessing.sql'
    );
    const viewSql = migration017.sql.slice(
      migration017.sql.lastIndexOf('CREATE OR REPLACE VIEW ipro.active_canonical_transactions')
    );

    expect(migration019.sql).not.toContain('CREATE OR REPLACE VIEW ipro.active_canonical_transactions');
    expect(viewSql).toContain("b.status = 'READY'");
    expect(viewSql).toContain("b.data_scope <> 'synthetic_test'");
    expect(viewSql).toContain("t.record_status = 'CANONICAL'");
    expect(viewSql).toContain("t.resolution_state = 'RESOLVED'");
    expect(viewSql).toContain('t.customer_entity_id IS NOT NULL');
    expect(viewSql).toContain("t.product_resolution_state = 'RESOLVED'");
    expect(viewSql).toContain('t.product_entity_id IS NOT NULL');
    expect(viewSql).toContain("sf.status IN ('PARSED', 'RECEIVED')");
  });

  it('keeps migration 017 allowed enum sets unchanged', async () => {
    const migrations = await readMigrationFiles(migrationsDir);
    const migration017 = migrations.find(
      (migration) => migration.filename === '017_ipro_canonical_product_gate.sql'
    );
    const migration019 = migrations.find(
      (migration) => migration.filename === '019_ipro_controlled_reprocessing.sql'
    );

    expect(migration017.sql).toContain(
      "CHECK (data_scope IN ('synthetic_test', 'controlled_pilot', 'operational', 'historical_backfill'))"
    );
    expect(migration017.sql).toContain(
      "CHECK (product_resolution_state IN ('RESOLVED', 'AMBIGUOUS', 'UNMATCHED'))"
    );
    expect(migration017.sql).toContain(
      "CHECK (product_resolution_method IN ('exact_sku', 'exact_code', 'exact_alias', 'unique_normalized_text', 'ambiguous', 'unmatched'))"
    );
    expect(migration019.sql).not.toMatch(/data_scope\s+IN\s*\(/i);
    expect(migration019.sql).not.toMatch(/product_resolution_(?:state|method)\s+IN\s*\(/i);
  });
});
