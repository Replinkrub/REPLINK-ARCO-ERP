import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readMigrationFiles, runMigrations } from '../scripts/db-migrate.mjs';

const { Client } = pg;
const migrationsDir = resolve(process.cwd(), 'src/infrastructure/postgres/migrations');
const integrationDatabaseUrl = process.env.IPRO_REPROCESSING_TEST_DATABASE_URL?.trim();
const describeWithDisposablePostgres = integrationDatabaseUrl ? describe : describe.skip;

describeWithDisposablePostgres('IPRO migration 019 PostgreSQL integration', () => {
  it(
    'migrates legacy generations and enforces controlled reprocessing contracts',
    async () => {
      assertDisposableDatabaseUrl(integrationDatabaseUrl);
      const client = new Client({ connectionString: integrationDatabaseUrl });
      await client.connect();

      try {
        await prepareDisposableDatabase(client);
        const { legacyMigrations, migration019 } = await loadIproMigrations();

        expect(await runMigrations(client, legacyMigrations, silentLogger())).toEqual({
          applied: 3,
          skipped: 0,
        });
        await seedLegacyData(client);
        await seedLegacyStableIdColumns(client);

        expect(await runMigrations(client, [migration019], silentLogger())).toEqual({
          applied: 1,
          skipped: 0,
        });

        await assertProcessingFingerprintMigration(client);
        await assertTransactionGenerationUniqueness(client);
        await assertImmutableSourceFileUniqueness(client);
        await assertStableRepresentedScope(client);
        await assertAtomicReadyGenerationCutover(client);

        expect(await runMigrations(client, [migration019], silentLogger())).toEqual({
          applied: 0,
          skipped: 1,
        });
        await client.query(migration019.sql);
        await expect(
          runMigrations(
            client,
            [{ ...migration019, sql: `${migration019.sql}\n-- checksum change` }],
            silentLogger()
          )
        ).rejects.toThrow('MIGRATION_CHECKSUM_MISMATCH: 019_ipro_controlled_reprocessing.sql');
      } finally {
        await cleanDisposableDatabase(client);
        await client.end();
      }
    },
    60_000
  );

  it(
    'rolls the migration back without replacing indexes when stable scopes collide',
    async () => {
      assertDisposableDatabaseUrl(integrationDatabaseUrl);
      const client = new Client({ connectionString: integrationDatabaseUrl });
      await client.connect();

      try {
        await prepareDisposableDatabase(client);
        const { legacyMigrations, migration019 } = await loadIproMigrations();
        await runMigrations(client, legacyMigrations, silentLogger());
        await seedStableScopeCollision(client);

        await expect(runMigrations(client, [migration019], silentLogger())).rejects.toThrow(
          'IPRO_019_STABLE_SCOPE_COLLISION: product_entities sku'
        );

        const migrationRecord = await client.query(
          `SELECT filename FROM schema_migrations
           WHERE filename = '019_ipro_controlled_reprocessing.sql'`
        );
        expect(migrationRecord.rowCount).toBe(0);

        const rolledBackColumns = await client.query(
          `SELECT table_name, column_name
           FROM information_schema.columns
           WHERE table_schema = 'ipro'
             AND (
               (table_name = 'ingestion_batches' AND column_name = 'processing_fingerprint')
               OR (
                 table_name IN ('product_entities', 'product_aliases', 'product_resolutions')
                 AND column_name = 'represented_company_id'
               )
             )`
        );
        expect(rolledBackColumns.rowCount).toBe(0);

        const rolledBackFunction = await client.query(
          `SELECT to_regprocedure('ipro.canonical_represented_company_id(text)') AS function_name`
        );
        expect(rolledBackFunction.rows[0]?.function_name).toBeNull();

        const legacyIndexes = await client.query(
          `SELECT indexname, indexdef
           FROM pg_indexes
           WHERE schemaname = 'ipro'
             AND indexname IN (
               'ux_ipro_product_entities_sku_represented',
               'ux_ipro_product_entities_code_represented',
               'ux_ipro_product_aliases_lookup_represented'
             )
           ORDER BY indexname`
        );
        expect(legacyIndexes.rowCount).toBe(3);
        for (const row of legacyIndexes.rows) {
          expect(row.indexdef).toContain('represented_company');
          expect(row.indexdef).not.toContain('represented_company_id');
        }
      } finally {
        await cleanDisposableDatabase(client);
        await client.end();
      }
    },
    60_000
  );
});

async function loadIproMigrations() {
  const migrations = await readMigrationFiles(migrationsDir);
  const legacyMigrations = migrations.filter((migration) =>
    [
      '016_ipro_foundation.sql',
      '017_ipro_canonical_product_gate.sql',
      '018_ipro_product_alias_represented_scope.sql',
    ].includes(migration.filename)
  );
  const migration019 = migrations.find(
    (migration) => migration.filename === '019_ipro_controlled_reprocessing.sql'
  );

  expect(legacyMigrations.map((migration) => migration.filename)).toEqual([
    '016_ipro_foundation.sql',
    '017_ipro_canonical_product_gate.sql',
    '018_ipro_product_alias_represented_scope.sql',
  ]);
  expect(migration019).toBeDefined();
  return { legacyMigrations, migration019 };
}

function assertDisposableDatabaseUrl(value) {
  if (!value) {
    throw new Error('IPRO_REPROCESSING_TEST_DATABASE_URL is required for this integration test.');
  }

  const parsed = new URL(value);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const isLocalHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  const isDisposableName = /^ipro_reprocessing_(?:test|ci)(?:_[a-z0-9_-]+)?$/.test(databaseName);

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !isLocalHost || !isDisposableName) {
    throw new Error(
      'Integration test refused a non-local or non-disposable database; use a local ipro_reprocessing_test/ci database.'
    );
  }
}

async function prepareDisposableDatabase(client) {
  await cleanDisposableDatabase(client);
  await client.query('CREATE SCHEMA ipro');
}

async function cleanDisposableDatabase(client) {
  await client.query('DROP SCHEMA IF EXISTS ipro CASCADE');
  await client.query('DROP TABLE IF EXISTS schema_migrations');
}

async function seedLegacyData(client) {
  await client.query(
    `INSERT INTO ipro.ingestion_batches (
       id, status, source_system, idempotency_key, completed_at, metadata
     ) VALUES
       ($1, 'READY', 'integration_test', $2, now(), $3::jsonb),
       ($4, 'READY', 'integration_test', $5, now(), $6::jsonb)`,
    [
      'batch_legacy_metadata',
      'legacy-metadata-key',
      JSON.stringify({ processing_fingerprint: 'sha256:legacy-metadata' }),
      'batch_legacy_fallback',
      'legacy-fallback-key',
      JSON.stringify({}),
    ]
  );
  await client.query(
    `INSERT INTO ipro.source_files (
       id, batch_id, file_name, file_kind, content_hash, row_count, status, metadata
     ) VALUES ($1, $2, $3, 'synthetic_integration', $4, 1, 'PARSED', '{}'::jsonb)`,
    ['source_immutable', 'batch_legacy_metadata', 'synthetic.xlsx', 'sha256:immutable-source']
  );
  await client.query(
    `INSERT INTO ipro.customer_entities (id, canonical_name, canonical_document)
     VALUES ('customer_legacy', 'Synthetic Customer', 'synthetic-document')`
  );
  await client.query(
    `INSERT INTO ipro.product_entities (
       id, canonical_key, sku, product_code, represented_company,
       normalized_description, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      'product_legacy',
      'product:legacy',
      'SKU-LEGACY',
      'CODE-LEGACY',
      'Legacy Display A',
      'legacy product',
      JSON.stringify({ represented_company_stable_id: 'rep-stable-1' }),
    ]
  );
  await client.query(
    `INSERT INTO ipro.product_aliases (
       id, product_entity_id, source_type, alias_type, represented_company,
       normalized_value, metadata
     ) VALUES ($1, $2, 'integration', 'sku', $3, $4, '{}'::jsonb)`,
    ['alias_legacy', 'product_legacy', 'Legacy Display A', 'sku-legacy']
  );
  await insertTransaction(
    client,
    'transaction_legacy',
    'batch_legacy_metadata',
    'row-hash-shared',
    'event-hash-shared'
  );
  await client.query(
    `INSERT INTO ipro.product_resolutions (
       id, batch_id, transaction_id, source_product_key, represented_company,
       resolved_product_entity_id, resolution_state, resolution_method, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, 'RESOLVED', 'exact_sku', $7::jsonb)`,
    [
      'resolution_legacy',
      'batch_legacy_metadata',
      'transaction_legacy',
      'SKU-LEGACY',
      'Legacy Display A',
      'product_legacy',
      JSON.stringify({ represented_company_stable_id: 'rep-stable-resolution' }),
    ]
  );
}

async function seedStableScopeCollision(client) {
  await client.query(
    `INSERT INTO ipro.product_entities (
       id, canonical_key, sku, product_code, represented_company,
       normalized_description, metadata
     ) VALUES
       ('collision_a', 'collision:a', 'SKU-COLLISION', 'CODE-A', 'Display A', 'collision a', $1::jsonb),
       ('collision_b', 'collision:b', 'SKU-COLLISION', 'CODE-B', 'Display B', 'collision b', $2::jsonb)`,
    [
      JSON.stringify({ represented_company_stable_id: 'rep-stable-collision' }),
      JSON.stringify({ represented_company_stable_id: 'rep-stable-collision' }),
    ]
  );
}

async function seedLegacyStableIdColumns(client) {
  await client.query('ALTER TABLE ipro.product_entities ADD COLUMN represented_company_id TEXT');
  await client.query('ALTER TABLE ipro.product_aliases ADD COLUMN represented_company_id TEXT');
  await client.query('ALTER TABLE ipro.product_resolutions ADD COLUMN represented_company_id TEXT');
  await client.query(
    `UPDATE ipro.product_entities SET represented_company_id = $1 WHERE id = 'product_legacy'`,
    [' \trep-stable-1\r\n']
  );
  await client.query(
    `UPDATE ipro.product_aliases SET represented_company_id = $1 WHERE id = 'alias_legacy'`,
    ['\t\n\r\f\v']
  );
  await client.query(
    `UPDATE ipro.product_resolutions SET represented_company_id = $1 WHERE id = 'resolution_legacy'`,
    ['\rrep-stable-resolution\f']
  );
}

async function assertProcessingFingerprintMigration(client) {
  const columns = await client.query(
    `SELECT table_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'ipro'
       AND table_name = 'ingestion_batches'
       AND column_name = 'processing_fingerprint'`
  );
  expect(columns.rows).toEqual([{ table_name: 'ingestion_batches', is_nullable: 'NO' }]);

  const batches = await client.query(
    `SELECT id, processing_fingerprint
     FROM ipro.ingestion_batches
     ORDER BY id`
  );
  expect(batches.rows).toEqual([
    {
      id: 'batch_legacy_fallback',
      processing_fingerprint: 'legacy:idempotency:legacy-fallback-key',
    },
    { id: 'batch_legacy_metadata', processing_fingerprint: 'sha256:legacy-metadata' },
  ]);

  await expectPgViolation(
    () =>
      client.query(
        `INSERT INTO ipro.ingestion_batches (id, status, source_system, idempotency_key)
         VALUES ('batch_null_fingerprint', 'PROCESSING', 'integration_test', 'null-fingerprint')`
      ),
    '23502'
  );
  await expectPgViolation(
    () =>
      client.query(
        `INSERT INTO ipro.ingestion_batches (
           id, status, source_system, idempotency_key, processing_fingerprint
         ) VALUES ('batch_empty_fingerprint', 'PROCESSING', 'integration_test', 'empty-fingerprint', '')`
      ),
    '23514'
  );
  await expectPgViolation(
    () =>
      client.query(
        `INSERT INTO ipro.ingestion_batches (
           id, status, source_system, idempotency_key, processing_fingerprint
         ) VALUES ('batch_whitespace_fingerprint', 'PROCESSING', 'integration_test', 'space-fingerprint', '   ')`
      ),
    '23514'
  );
}

async function assertTransactionGenerationUniqueness(client) {
  const constraints = await client.query(
    `SELECT pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint AS c
     WHERE c.conrelid = 'ipro.transactions'::regclass
       AND c.contype = 'u'`
  );
  const normalizedConstraints = constraints.rows.map((row) =>
    String(row.definition).toLowerCase().replace(/\s+/g, '')
  );
  expect(normalizedConstraints).not.toContain('unique(business_event_hash)');
  expect(normalizedConstraints).not.toContain('unique(source_file_id,source_row_hash)');

  await expectPgViolation(
    () =>
      insertTransaction(
        client,
        'transaction_same_batch_event',
        'batch_legacy_metadata',
        'row-hash-other',
        'event-hash-shared'
      ),
    '23505'
  );
  await expectPgViolation(
    () =>
      insertTransaction(
        client,
        'transaction_same_batch_row',
        'batch_legacy_metadata',
        'row-hash-shared',
        'event-hash-other'
      ),
    '23505'
  );

  await client.query(
    `INSERT INTO ipro.ingestion_batches (
       id, status, source_system, idempotency_key, processing_fingerprint
     ) VALUES ($1, 'PROCESSING', 'integration_test', $2, $3)`,
    ['batch_new_generation', 'new-generation-key', 'sha256:new-generation']
  );
  await insertTransaction(
    client,
    'transaction_new_generation',
    'batch_new_generation',
    'row-hash-shared',
    'event-hash-shared'
  );

  const transactionIndexes = await client.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'ipro'
       AND indexname IN (
         'ux_ipro_transactions_batch_source_row_hash',
         'ux_ipro_transactions_batch_business_event_hash'
       )`
  );
  expect(transactionIndexes.rowCount).toBe(2);
  for (const row of transactionIndexes.rows) {
    expect(row.indexdef).toContain('batch_id');
  }
}

async function assertImmutableSourceFileUniqueness(client) {
  await expectPgViolation(
    () =>
      client.query(
        `INSERT INTO ipro.source_files (
           id, batch_id, file_name, file_kind, content_hash, status
         ) VALUES ($1, $2, $3, 'synthetic_integration', $4, 'PARSED')`,
        [
          'source_duplicate',
          'batch_new_generation',
          'duplicate.xlsx',
          'sha256:immutable-source',
        ]
      ),
    '23505'
  );
}

async function assertStableRepresentedScope(client) {
  const columns = await client.query(
    `SELECT table_name
     FROM information_schema.columns
     WHERE table_schema = 'ipro'
       AND column_name = 'represented_company_id'
       AND table_name IN ('product_entities', 'product_aliases', 'product_resolutions')
     ORDER BY table_name`
  );
  expect(columns.rows.map((row) => row.table_name)).toEqual([
    'product_aliases',
    'product_entities',
    'product_resolutions',
  ]);

  const stableIds = await client.query(
    `SELECT
       (SELECT represented_company_id FROM ipro.product_entities WHERE id = 'product_legacy') AS entity_id,
       (SELECT represented_company_id FROM ipro.product_aliases WHERE id = 'alias_legacy') AS alias_id,
       (SELECT represented_company_id FROM ipro.product_resolutions WHERE id = 'resolution_legacy') AS resolution_id`
  );
  expect(stableIds.rows[0]).toEqual({
    entity_id: 'rep-stable-1',
    alias_id: 'rep-stable-1',
    resolution_id: 'rep-stable-resolution',
  });

  const canonicalConstraints = await client.query(
    `SELECT conname
     FROM pg_constraint
     WHERE conrelid IN (
       'ipro.product_entities'::regclass,
       'ipro.product_aliases'::regclass,
       'ipro.product_resolutions'::regclass
     )
       AND conname LIKE 'ipro_product_%_represented_company_id_canonical_ck'
     ORDER BY conname`
  );
  expect(canonicalConstraints.rows.map((row) => row.conname)).toEqual([
    'ipro_product_aliases_represented_company_id_canonical_ck',
    'ipro_product_entities_represented_company_id_canonical_ck',
    'ipro_product_resolutions_represented_company_id_canonical_ck',
  ]);

  const invalidStableIds = [
    '',
    '   ',
    '\t',
    '\n',
    '\r',
    '\f',
    '\v',
    '\trep-padded\t',
    '\nrep-padded\r',
    '\frep-padded\v',
    'rep\nid',
  ];
  for (const { table, id } of [
    { table: 'product_entities', id: 'product_legacy' },
    { table: 'product_aliases', id: 'alias_legacy' },
    { table: 'product_resolutions', id: 'resolution_legacy' },
  ]) {
    for (const invalidId of invalidStableIds) {
      await expectPgViolation(
        () =>
          client.query(
            `UPDATE ipro.${table} SET represented_company_id = $1 WHERE id = $2`,
            [invalidId, id]
          ),
        '23514'
      );
    }
  }

  const indexes = await client.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'ipro'
       AND indexname IN (
         'ux_ipro_product_entities_sku_represented',
         'ux_ipro_product_entities_code_represented',
         'ux_ipro_product_aliases_lookup_represented'
       )`
  );
  expect(indexes.rowCount).toBe(3);
  for (const row of indexes.rows) {
    const normalizedDefinition = row.indexdef.toLowerCase().replace(/\s+/g, ' ');
    expect(normalizedDefinition).toContain('represented_company_id');
    expect(normalizedDefinition).toContain('represented_company');
    expect(normalizedDefinition).toContain(
      'canonical_represented_company_id(represented_company_id)'
    );
  }

  await expectPgViolation(
    () =>
      client.query(
        `INSERT INTO ipro.product_entities (
           id, canonical_key, sku, product_code, represented_company,
           represented_company_id, normalized_description
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          'product_stable_scope_conflict',
          'product:stable-scope-conflict',
          'SKU-LEGACY',
          'CODE-OTHER',
          'Renamed Display',
          'rep-stable-1',
          'stable scope conflict',
        ]
      ),
    '23505'
  );

  await client.query(
    `INSERT INTO ipro.product_entities (
       id, canonical_key, sku, product_code, represented_company,
       represented_company_id, normalized_description
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      'product_alias_scope',
      'product:alias-scope',
      'SKU-ALIAS-SCOPE',
      'CODE-ALIAS-SCOPE',
      'Renamed Display',
      'rep-stable-1',
      'alias stable scope',
    ]
  );
  await expectPgViolation(
    () =>
      client.query(
        `INSERT INTO ipro.product_aliases (
           id, product_entity_id, source_type, alias_type, represented_company,
           represented_company_id, normalized_value
         ) VALUES ($1, $2, 'integration', 'sku', $3, $4, $5)`,
        [
          'alias_stable_scope_conflict',
          'product_alias_scope',
          'Renamed Display',
          'rep-stable-1',
          'sku-legacy',
        ]
      ),
    '23505'
  );

  await assertFallbackDisplayScopeUniqueness(client);
}

async function assertFallbackDisplayScopeUniqueness(client) {
  await client.query(
    `INSERT INTO ipro.product_entities (
       id, canonical_key, sku, product_code, represented_company, normalized_description
     ) VALUES
       ('product_fallback_a', 'product:fallback-a', 'SKU-FALLBACK-A', 'CODE-FALLBACK-A',
        'Fallback Display', 'fallback a'),
       ('product_fallback_b', 'product:fallback-b', 'SKU-FALLBACK-B', 'CODE-FALLBACK-B',
        'Fallback Display', 'fallback b')`
  );

  await expectPgViolation(
    () =>
      client.query(
        `INSERT INTO ipro.product_entities (
           id, canonical_key, sku, product_code, represented_company,
           represented_company_id, normalized_description
         ) VALUES (
           'product_fallback_control_bypass', 'product:fallback-control-bypass',
           'SKU-FALLBACK-A', 'CODE-FALLBACK-CONTROL', 'Fallback Display', $1,
           'fallback control bypass'
         )`,
        ['\t']
      ),
    '23514'
  );

  await expectPgViolation(
    () =>
      client.query(
        `INSERT INTO ipro.product_entities (
           id, canonical_key, sku, product_code, represented_company, normalized_description
         ) VALUES (
           'product_fallback_duplicate', 'product:fallback-duplicate', 'SKU-FALLBACK-A',
           'CODE-FALLBACK-DUPLICATE', 'Fallback Display', 'fallback duplicate'
         )`
      ),
    '23505'
  );

  await client.query(
    `INSERT INTO ipro.product_aliases (
       id, product_entity_id, source_type, alias_type, represented_company, normalized_value
     ) VALUES (
       'alias_fallback_a', 'product_fallback_a', 'integration_fallback', 'sku',
       'Fallback Display', 'fallback-alias'
     )`
  );
  await expectPgViolation(
    () =>
      client.query(
        `INSERT INTO ipro.product_aliases (
           id, product_entity_id, source_type, alias_type, represented_company, normalized_value
         ) VALUES (
           'alias_fallback_duplicate', 'product_fallback_b', 'integration_fallback', 'sku',
           'Fallback Display', 'fallback-alias'
         )`
      ),
    '23505'
  );
}

async function assertAtomicReadyGenerationCutover(client) {
  expect(await activeGenerationRows(client)).toEqual([
    { id: 'transaction_legacy', batch_id: 'batch_legacy_metadata' },
  ]);

  const observer = new Client({ connectionString: integrationDatabaseUrl });
  await observer.connect();
  let transitionOpen = false;

  try {
    await client.query('BEGIN');
    transitionOpen = true;
    await client.query(
      `UPDATE ipro.ingestion_batches
       SET status = 'SUPERSEDED', superseded_at = now()
       WHERE id = 'batch_legacy_metadata'`
    );

    // The old generation remains visible to another session until both status
    // changes commit together; there is no trigger or intermediate cutover.
    expect(await activeGenerationRows(observer)).toEqual([
      { id: 'transaction_legacy', batch_id: 'batch_legacy_metadata' },
    ]);

    await client.query(
      `UPDATE ipro.ingestion_batches
       SET status = 'READY', completed_at = now()
       WHERE id = 'batch_new_generation'`
    );
    await client.query('COMMIT');
    transitionOpen = false;

    expect(await activeGenerationRows(observer)).toEqual([
      { id: 'transaction_new_generation', batch_id: 'batch_new_generation' },
    ]);
  } finally {
    if (transitionOpen) {
      await client.query('ROLLBACK');
    }
    await observer.end();
  }
}

async function activeGenerationRows(client) {
  const result = await client.query(
    `SELECT id, batch_id
     FROM ipro.active_canonical_transactions
     ORDER BY id`
  );
  return result.rows;
}

async function insertTransaction(client, id, batchId, sourceRowHash, businessEventHash) {
  return client.query(
    `INSERT INTO ipro.transactions (
       id, batch_id, source_file_id, source_row_hash, business_event_hash,
       customer_entity_id, product_key, product_entity_id, transaction_date,
       resolution_state, record_status, product_resolution_state, product_resolution_method
     ) VALUES (
       $1, $2, 'source_immutable', $3, $4, 'customer_legacy', 'SKU-LEGACY',
       'product_legacy', DATE '2026-01-01', 'RESOLVED', 'CANONICAL', 'RESOLVED', 'exact_sku'
     )`,
    [id, batchId, sourceRowHash, businessEventHash]
  );
}

async function expectPgViolation(action, expectedCode) {
  try {
    await action();
    throw new Error(`Expected PostgreSQL violation ${expectedCode}.`);
  } catch (error) {
    expect(error?.code).toBe(expectedCode);
  }
}

function silentLogger() {
  return { log: () => {} };
}
