import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import {
  PostgresClient,
  PostgresOrderRepository,
  PostgresQuoteRepository,
  createMinimalHttpApi,
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run npm run test:smoke:db');
}

async function expectPgError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected Postgres error ${code}, but operation succeeded`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('db smoke (real postgres)', () => {
  const now = Date.now();
  const quoteId = `q-smoke-${now}`;
  const tenantId = process.env.APP_TENANT_ID?.trim() || `tenant-smoke-${now}`;
  const baseSequence = 100000 + (now % 700000);

  const db = new PostgresClient(databaseUrl as string);
  const pgClient = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await pgClient.connect();
  });

  afterAll(async () => {
    await pgClient.end();
    await db.close();
  });

  it('persists quote + order through minimal HTTP API flow', async () => {
    process.env.APP_TENANT_ID = tenantId;
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
    });

    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-smoke-${now}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };

    const createResponse = await api(new Request('http://localhost/v0/quotes', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: quoteId,
        customerId: `customer-smoke-${now}`,
        ownerId: `owner-smoke-${now}`,
        representativeId: `rep-smoke-${now}`,
        numberSequence: baseSequence,
      }),
    }));
    expect(createResponse.status).toBe(201);

    const createdQuoteRow = await pgClient.query(
      'SELECT id, document_type, tenant_id, status FROM commercial_documents WHERE id = $1 LIMIT 1',
      [quoteId]
    );
    expect(createdQuoteRow.rowCount).toBe(1);
    expect(createdQuoteRow.rows[0]?.document_type).toBe('quote');
    expect(createdQuoteRow.rows[0]?.tenant_id).toBe(tenantId);

    const confirmResponse = await api(new Request(`http://localhost/v0/quotes/${quoteId}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderSequence: baseSequence + 1 }),
    }));
    expect(confirmResponse.status).toBe(200);

    const quoteRow = await pgClient.query(
      'SELECT id, document_type, number, status FROM commercial_documents WHERE id = $1 LIMIT 1',
      [quoteId]
    );
    expect(quoteRow.rowCount).toBe(1);
    expect(quoteRow.rows[0]?.document_type).toBe('quote');
    expect(quoteRow.rows[0]?.number).toMatch(/^ORC-/);

    const orderRow = await pgClient.query(
      'SELECT id, source_quote_id, document_type, tenant_id, number, status FROM commercial_documents WHERE source_quote_id = $1 LIMIT 1',
      [quoteId]
    );
    expect(orderRow.rowCount).toBe(1);
    expect(orderRow.rows[0]?.id).not.toBe(quoteId);
    expect(orderRow.rows[0]?.document_type).toBe('order');
    expect(orderRow.rows[0]?.tenant_id).toBe(tenantId);
    expect(orderRow.rows[0]?.number).toMatch(/^PED-/);

    const duplicateConfirmResponse = await api(new Request(`http://localhost/v0/quotes/${quoteId}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderSequence: baseSequence + 1 }),
    }));
    expect(duplicateConfirmResponse.status).toBe(409);

    const orderCount = await pgClient.query(
      'SELECT COUNT(*)::int AS count FROM commercial_documents WHERE source_quote_id = $1 AND document_type = $2',
      [quoteId, 'order']
    );
    expect(orderCount.rows[0]?.count).toBe(1);
  });

  it('validates security tenant roles and audit foundation', async () => {
    const securityTenantId = `tenant-security-${now}`;
    const userId = `user-security-${now}`;

    const roles = await pgClient.query(
      'SELECT code, status FROM roles WHERE code = ANY($1::text[]) ORDER BY code',
      [['ADMIN', 'GESTOR_COMERCIAL', 'REPRESENTANTE']]
    );
    expect(roles.rows).toEqual([
      { code: 'ADMIN', status: 'active' },
      { code: 'GESTOR_COMERCIAL', status: 'reserved' },
      { code: 'REPRESENTANTE', status: 'active' },
    ]);

    await expectPgError(
      pgClient.query("INSERT INTO roles (id, code, status) VALUES ($1, 'VISUALIZADOR', 'active')", [
        `role-visualizador-${now}`,
      ]),
      '23514'
    );

    await pgClient.query('INSERT INTO tenants (id, name, status) VALUES ($1, $2, $3)', [
      securityTenantId,
      `Security Tenant ${now}`,
      'active',
    ]);
    await pgClient.query('INSERT INTO tenant_memberships (id, tenant_id, user_id, status) VALUES ($1, $2, $3, $4)', [
      `membership-${now}`,
      securityTenantId,
      userId,
      'active',
    ]);

    await expectPgError(
      pgClient.query('INSERT INTO tenant_memberships (id, tenant_id, user_id, status) VALUES ($1, $2, $3, $4)', [
        `membership-duplicate-${now}`,
        securityTenantId,
        userId,
        'active',
      ]),
      '23505'
    );

    await pgClient.query('INSERT INTO user_roles (id, tenant_id, user_id, role_code, status) VALUES ($1, $2, $3, $4, $5)', [
      `user-role-${now}`,
      securityTenantId,
      userId,
      'ADMIN',
      'active',
    ]);

    await expectPgError(
      pgClient.query('INSERT INTO user_roles (id, tenant_id, user_id, role_code, status) VALUES ($1, $2, $3, $4, $5)', [
        `user-role-duplicate-${now}`,
        securityTenantId,
        userId,
        'ADMIN',
        'active',
      ]),
      '23505'
    );

    await pgClient.query(
      `INSERT INTO audit_events (id, tenant_id, actor_id, actor_role, entity_type, entity_id, action, result, reason_code, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        `audit-denied-${now}`,
        securityTenantId,
        userId,
        'REPRESENTANTE',
        'commercial_document',
        `outside-wallet-${now}`,
        'view_confirmed_order',
        'denied',
        'OWNERSHIP_DENIED',
        JSON.stringify({ attemptedTenantId: securityTenantId }),
      ]
    );

    const auditEvent = await pgClient.query('SELECT result FROM audit_events WHERE id = $1', [`audit-denied-${now}`]);
    expect(auditEvent.rows[0]?.result).toBe('denied');

    await expectPgError(
      pgClient.query(
        `INSERT INTO audit_events (id, tenant_id, entity_type, action, result)
         VALUES ($1, $2, $3, $4, $5)`,
        [`audit-invalid-${now}`, securityTenantId, 'tenant', 'invalid_result_test', 'blocked']
      ),
      '23514'
    );
  });

  it('enforces commercial document tenant foreign key', async () => {
    const constraint = await pgClient.query(
      `SELECT conname
       FROM pg_constraint
       WHERE conname = $1
         AND conrelid = 'commercial_documents'::regclass
       LIMIT 1`,
      ['commercial_documents_tenant_id_fkey']
    );
    expect(constraint.rowCount).toBe(1);

    await expectPgError(
      pgClient.query(
        `INSERT INTO commercial_documents (
          id, document_type, number, tenant_id, customer_id, owner_id, representative_id, status,
          items, totals, created_at, updated_at
        ) VALUES (
          $1, 'quote', $2, $3, $4, $5, $6, 'QUOTE_DRAFT',
          $7::jsonb, $8::jsonb, now(), now()
        )`,
        [
          `q-invalid-tenant-${now}`,
          `ORC-${baseSequence + 2}`,
          `tenant-invalid-${now}`,
          `customer-invalid-tenant-${now}`,
          `owner-invalid-tenant-${now}`,
          `rep-invalid-tenant-${now}`,
          JSON.stringify([]),
          JSON.stringify({ subtotal: 0, discountTotal: 0, grandTotal: 0 }),
        ]
      ),
      '23503'
    );
  });
});
