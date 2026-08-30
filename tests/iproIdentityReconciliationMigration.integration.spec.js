import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readMigrationFiles, runMigrations } from '../scripts/db-migrate.mjs';

const { Client } = pg;
const migrationsDir = resolve(process.cwd(), 'src/infrastructure/postgres/migrations');
const databaseUrl = process.env.IPRO_REPROCESSING_TEST_DATABASE_URL?.trim();
const describeDisposable = databaseUrl ? describe : describe.skip;

describeDisposable('IPRO migration 022 customer identity reconciliation', () => {
  it('executes on the canonical schema and enforces immutable, idempotent reconciliation evidence', async () => {
    assertDisposableUrl(databaseUrl);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    try {
      await clean(client);
      await client.query('CREATE SCHEMA ipro');
      const { canonicalMigrations, migration022 } = await loadMigrations();

      expect(await runMigrations(client, canonicalMigrations, silentLogger())).toEqual({
        applied: 6,
        skipped: 0,
      });
      await seedCanonicalIdentity(client);
      const transactionBefore = await transactionSnapshot(client);
      const activeViewBefore = await activeViewDefinition(client);

      expect(await runMigrations(client, [migration022], silentLogger())).toEqual({
        applied: 1,
        skipped: 0,
      });

      expect(await transactionSnapshot(client)).toEqual(transactionBefore);
      expect(await activeViewDefinition(client)).toBe(activeViewBefore);
      expect((await client.query(
        `SELECT effective_identity_reconciliation_event_id
         FROM ipro.transactions WHERE id = 'transaction-old'`
      )).rows).toEqual([{ effective_identity_reconciliation_event_id: null }]);
      expect(await publicMutationPrivileges(client)).toEqual([
        { relname: 'identity_reconciliation_events', has_public_mutation: false },
        { relname: 'identity_reconciliation_runs', has_public_mutation: false },
        { relname: 'order_document_evidence', has_public_mutation: false },
      ]);

      await seedReconciliationAudit(client);
      expect((await client.query(
        `SELECT order_key, count(*)::integer AS evidence_count,
                count(DISTINCT normalized_document)::integer AS document_count
         FROM ipro.order_document_evidence GROUP BY order_key`
       )).rows).toEqual([{ order_key: 'order-1', evidence_count: 2, document_count: 2 }]);
      expect((await client.query(
        `SELECT evidence_kind, evidence_id
         FROM ipro.identity_reconciliation_events
         WHERE action = 'TRANSACTION_IDENTITY_RECONCILED'
         ORDER BY evidence_kind`
      )).rows).toEqual([
        { evidence_kind: 'DIRECT_DOCUMENT', evidence_id: null },
        { evidence_kind: 'SOURCE_ORDER_DOCUMENT', evidence_id: 'evidence-a' },
        { evidence_kind: 'STABLE_REGISTRY_DOCUMENT', evidence_id: null },
      ]);

      await expectPgError(
        () => insertTransactionEvent(client, 'event-transaction-duplicate', hash('a')),
        '23505'
      );
      await expectPgError(
        () => insertTransactionEvent(
          client,
          'event-wrong-evidence-hash',
          hash('a'),
          'evidence-b',
          'transaction-wrong'
        ),
        '23503'
      );
      await expectPgError(
        () => client.query(
          `INSERT INTO ipro.identity_reconciliation_events (
             id, run_id, action, transaction_id, customer_document_id, evidence_kind, evidence_hash,
             prior_document_type, prior_document, new_document_type, new_document
           ) VALUES (
             'event-invalid-target', 'run-1', 'CUSTOMER_DOCUMENT_TYPE_CORRECTED',
             'transaction-old', 'document-old', 'DOCUMENT_TYPE_SHAPE_CORRECTION', $1,
             'CNPJ', '12345678901', 'CPF', '12345678901'
           )`,
          [hash('8')]
        ),
        '23514'
      );
      await expectPgError(
        () => insertDocumentCorrectionEvent(client, 'event-document-duplicate'),
        '23505'
      );

      await expectPgError(
        () => client.query("UPDATE ipro.identity_reconciliation_runs SET summary = '{\"changed\":true}'::jsonb"),
        '55000'
      );
      await expectPgError(
        () => client.query("DELETE FROM ipro.order_document_evidence WHERE id = 'evidence-b'"),
        '55000'
      );
      await expectPgError(
        () => client.query("UPDATE ipro.identity_reconciliation_events SET metadata = '{\"changed\":true}'::jsonb"),
        '55000'
      );

      await client.query(migration022.sql);
      expect(await runMigrations(client, [migration022], silentLogger())).toEqual({
        applied: 0,
        skipped: 1,
      });
    } finally {
      await clean(client);
      await client.end();
    }
  }, 60_000);
});

async function loadMigrations() {
  const migrations = await readMigrationFiles(migrationsDir);
  const canonicalMigrations = migrations.filter(({ filename }) =>
    /^(?:016|017|018|019|020|021)_ipro_/.test(filename)
  );
  const migration022 = migrations.find(
    ({ filename }) => filename === '022_ipro_customer_identity_reconciliation.sql'
  );

  expect(canonicalMigrations.map(({ filename }) => filename)).toEqual([
    '016_ipro_foundation.sql',
    '017_ipro_canonical_product_gate.sql',
    '018_ipro_product_alias_represented_scope.sql',
    '019_ipro_controlled_reprocessing.sql',
    '020_ipro_orphan_recovery_audit.sql',
    '021_ipro_runtime_role_binding_hardening.sql',
  ]);
  expect(migration022).toBeDefined();
  return { canonicalMigrations, migration022 };
}

async function seedCanonicalIdentity(client) {
  await client.query(
    `INSERT INTO ipro.ingestion_batches (
       id, status, source_system, idempotency_key, processing_fingerprint, completed_at
     ) VALUES ('batch-1', 'READY', 'integration_test', 'batch-key', 'batch-fingerprint', now())`
  );
  await client.query(
    `INSERT INTO ipro.source_files (
       id, batch_id, file_name, file_kind, content_hash, row_count, status
     ) VALUES ('source-1', 'batch-1', 'transactions.csv', 'integration_test', $1, 1, 'PARSED')`,
    [hash('9')]
  );
  await client.query(
    `INSERT INTO ipro.customer_entities (id, canonical_name, canonical_document) VALUES
       ('customer-old', 'Old Customer', 'legacy-customer-document'),
       ('customer-new', 'New Customer', '12345678901')`
  );
  await client.query(
    `INSERT INTO ipro.customer_documents (
       id, customer_entity_id, document_type, document_value, normalized_document, is_primary
     ) VALUES ('document-old', 'customer-old', 'CNPJ', '12345678901', '12345678901', true)`
  );
  await client.query(
    `INSERT INTO ipro.product_entities (
       id, canonical_key, sku, normalized_description, represented_company_id
     ) VALUES ('product-1', 'product:1', 'SKU-1', 'product one', 'represented-1')`
  );
  await client.query(
    `INSERT INTO ipro.transactions (
       id, batch_id, source_file_id, source_row_number, source_row_hash, business_event_hash,
       customer_entity_id, customer_document_type, customer_document, customer_name,
       product_key, product_entity_id, transaction_date, quantity, gross_amount, net_amount,
       resolution_state, record_status, product_resolution_state, product_resolution_method
     ) VALUES (
       'transaction-old', 'batch-1', 'source-1', 1, $1, $2,
       'customer-old', 'CNPJ', '12345678901', 'Old Customer',
       'SKU-1', 'product-1', DATE '2026-01-01', 3, 120, 100,
       'RESOLVED', 'CANONICAL', 'RESOLVED', 'exact_sku'
     )`,
    [hash('1'), hash('0')]
  );
  for (const [id, marker] of [
    ['transaction-direct', '4'],
    ['transaction-registry', '5'],
    ['transaction-wrong', '6'],
  ]) {
    await client.query(
      `INSERT INTO ipro.transactions (
         id, batch_id, source_file_id, source_row_number, source_row_hash, business_event_hash,
         customer_entity_id, customer_document_type, customer_document, customer_name,
         product_key, product_entity_id, transaction_date, quantity, gross_amount, net_amount,
         resolution_state, record_status, product_resolution_state, product_resolution_method
       ) VALUES (
         $1, 'batch-1', 'source-1', $2, $3, $4,
         'customer-old', 'CNPJ', '12345678901', 'Old Customer',
         'SKU-1', 'product-1', DATE '2026-01-01', 3, 120, 100,
         'RESOLVED', 'CANONICAL', 'RESOLVED', 'exact_sku'
       )`,
      [id, Number(marker), hash(marker), hash(String(Number(marker) + 1))]
    );
  }
}

async function seedReconciliationAudit(client) {
  await client.query(
    `INSERT INTO ipro.identity_reconciliation_runs (
       id, idempotency_key, plan_hash, evidence_manifest_hash, actor, mode, scope, summary
     ) VALUES ('run-1', 'apply-plan-1', $1, $2, 'integration-test', 'APPLY',
       '{"transaction_ids":["transaction-old"]}'::jsonb, '{"approved":true}'::jsonb)`,
    [hash('d'), hash('e')]
  );
  await client.query(
    `INSERT INTO ipro.order_document_evidence (
       id, evidence_hash, order_key, document_type, normalized_document,
       source_content_hash, source_row_number, source_kind
     ) VALUES
       ('evidence-a', $1, 'order-1', 'CPF', '12345678901', $3, 1, 'SOURCE_ORDER_DOCUMENT'),
       ('evidence-b', $2, 'order-1', 'CNPJ', '12345678000195', $3, 2, 'SOURCE_ORDER_DOCUMENT')`,
    [hash('a'), hash('b'), hash('9')]
  );
  await insertTransactionEvent(client, 'event-transaction', hash('a'));
  await insertTransactionEvent(
    client,
    'event-direct',
    hash('6'),
    null,
    'transaction-direct',
    'DIRECT_DOCUMENT'
  );
  await insertTransactionEvent(
    client,
    'event-registry',
    hash('7'),
    null,
    'transaction-registry',
    'STABLE_REGISTRY_DOCUMENT'
  );
  await insertDocumentCorrectionEvent(client, 'event-document');
}

function insertTransactionEvent(
  client,
  id,
  evidenceHash,
  evidenceId = 'evidence-a',
  transactionId = 'transaction-old',
  evidenceKind = 'SOURCE_ORDER_DOCUMENT'
) {
  return client.query(
    `INSERT INTO ipro.identity_reconciliation_events (
       id, run_id, action, transaction_id, evidence_id,
       prior_customer_entity_id, new_customer_entity_id,
       prior_resolution_state, new_resolution_state,
       prior_document_type, prior_document, new_document_type, new_document,
       preserved_event_identity_hash, preserved_material_content_hash,
       evidence_kind, evidence_hash
     ) VALUES (
       $1, 'run-1', 'TRANSACTION_IDENTITY_RECONCILED', $2, $3,
       'customer-old', 'customer-new', 'RESOLVED', 'RESOLVED',
       'CNPJ', '12345678901', 'CPF', '12345678901',
       $4, $5, $6, $7
      )`,
    [id, transactionId, evidenceId, hash('0'), hash('c'), evidenceKind, evidenceHash]
  );
}

function insertDocumentCorrectionEvent(client, id) {
  return client.query(
    `INSERT INTO ipro.identity_reconciliation_events (
       id, run_id, action, customer_document_id,
       prior_document_type, prior_document, new_document_type, new_document,
       evidence_kind, evidence_hash
     ) VALUES (
       $1, 'run-1', 'CUSTOMER_DOCUMENT_TYPE_CORRECTED', 'document-old',
       'CNPJ', '12345678901', 'CPF', '12345678901',
       'DOCUMENT_TYPE_SHAPE_CORRECTION', $2
     )`,
    [id, hash('f')]
  );
}

async function transactionSnapshot(client) {
  const result = await client.query(
    `SELECT to_jsonb(transaction_row) - 'effective_identity_reconciliation_event_id' AS snapshot
     FROM ipro.transactions AS transaction_row
     WHERE id = 'transaction-old'`
  );
  return result.rows[0]?.snapshot;
}

async function activeViewDefinition(client) {
  return (await client.query(
    "SELECT pg_get_viewdef('ipro.active_canonical_transactions'::regclass, true) AS definition"
  )).rows[0]?.definition;
}

async function publicMutationPrivileges(client) {
  return (await client.query(
    `SELECT relation.relname,
            COALESCE(bool_or(
              privilege.grantee = 0
              AND privilege.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
            ), false) AS has_public_mutation
     FROM pg_class AS relation
     JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     LEFT JOIN LATERAL aclexplode(
       COALESCE(relation.relacl, acldefault('r', relation.relowner))
     ) AS privilege ON true
     WHERE namespace.nspname = 'ipro'
       AND relation.relname IN (
         'identity_reconciliation_runs',
         'order_document_evidence',
         'identity_reconciliation_events'
       )
     GROUP BY relation.relname
     ORDER BY relation.relname`
  )).rows;
}

async function clean(client) {
  await client.query('DROP SCHEMA IF EXISTS ipro CASCADE');
  await client.query('DROP TABLE IF EXISTS schema_migrations');
  await client.query('DROP EXTENSION IF EXISTS pgcrypto');
}

async function expectPgError(action, code) {
  try {
    await action();
    throw new Error(`Expected PostgreSQL error ${code}.`);
  } catch (error) {
    expect(error?.code).toBe(code);
  }
}

function hash(character) {
  return character.repeat(64);
}

function silentLogger() {
  return { log: () => {} };
}

function assertDisposableUrl(value) {
  if (!value) throw new Error('IPRO_REPROCESSING_TEST_DATABASE_URL is required.');
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1'].includes(url.hostname)
    || !/^ipro_reprocessing_(?:test|ci)(?:_[a-z0-9_-]+)?$/.test(database)
  ) {
    throw new Error('Integration test requires a local disposable ipro_reprocessing_test/ci database.');
  }
}
