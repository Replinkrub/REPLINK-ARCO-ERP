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

describe('db smoke (real postgres)', () => {
  const now = Date.now();
  const quoteId = `q-smoke-${now}`;
  const tenantId = `tenant-smoke-${now}`;
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
      'SELECT id, document_type, status FROM commercial_documents WHERE id = $1 LIMIT 1',
      [quoteId]
    );
    expect(createdQuoteRow.rowCount).toBe(1);
    expect(createdQuoteRow.rows[0]?.document_type).toBe('quote');

    const confirmResponse = await api(new Request(`http://localhost/v0/quotes/${quoteId}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderSequence: baseSequence + 1 }),
    }));
    expect(confirmResponse.status).toBe(200);

    const quoteRow = await pgClient.query(
      'SELECT id, document_type, status FROM commercial_documents WHERE id = $1 LIMIT 1',
      [quoteId]
    );
    expect(quoteRow.rowCount).toBe(1);
    expect(quoteRow.rows[0]?.document_type).toBe('order');

    const orderRow = await pgClient.query(
      'SELECT source_quote_id, document_type, status FROM commercial_documents WHERE source_quote_id = $1 LIMIT 1',
      [quoteId]
    );
    expect(orderRow.rowCount).toBe(1);
    expect(orderRow.rows[0]?.document_type).toBe('order');
  });
});
