import { describe, expect, it } from 'vitest';
import { createMinimalHttpApi, InMemoryOrderRepository, InMemoryQuoteRepository } from '../src/index.js';

const ORIGINAL_APP_TENANT_ID = process.env.APP_TENANT_ID;

async function withEnvironmentTenant<T>(tenantId: string, run: () => Promise<T> | T): Promise<T> {
  process.env.APP_TENANT_ID = tenantId;
  try {
    return await run();
  } finally {
    if (ORIGINAL_APP_TENANT_ID === undefined) {
      delete process.env.APP_TENANT_ID;
    } else {
      process.env.APP_TENANT_ID = ORIGINAL_APP_TENANT_ID;
    }
  }
}

function actorHeaders(overrides: Record<string, string> = {}) {
  return {
    'x-actor-role': 'ADMIN',
    'x-actor-id': 'admin-1',
    'content-type': 'application/json',
    ...overrides,
  };
}

describe('minimal HTTP API', () => {
  it('creates quote and confirms into order using use cases', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const quoteRepository = new InMemoryQuoteRepository();
      const orderRepository = new InMemoryOrderRepository();
      const api = createMinimalHttpApi({ quoteRepository, orderRepository });

      const createResponse = await api(
        new Request('http://localhost/v0/quotes', {
          method: 'POST',
          headers: actorHeaders({ 'x-tenant-id': 'tenant-env-1' }),
          body: JSON.stringify({
            id: 'q-http-1',
            customerId: 'customer-1',
            ownerId: 'owner-1',
            representativeId: 'rep-1',
            numberSequence: 45,
          }),
        })
      );

      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as { tenantId: string };
      expect(created.tenantId).toBe('tenant-env-1');

      const confirmResponse = await api(
        new Request('http://localhost/v0/quotes/q-http-1/confirm', {
          method: 'POST',
          headers: actorHeaders({ 'x-tenant-id': 'tenant-env-1' }),
          body: JSON.stringify({ orderSequence: 99 }),
        })
      );

      expect(confirmResponse.status).toBe(200);
      const confirmed = (await confirmResponse.json()) as { status: string; source_quote_id: string; tenantId: string };
      expect(confirmed.status).toBe('ORDER_CONFIRMED');
      expect(confirmed.source_quote_id).toBe('q-http-1');
      expect(confirmed.tenantId).toBe('tenant-env-1');
    });
  });

  it('blocks tenant header mismatch against environment tenant', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
      });

      const response = await api(new Request('http://localhost/v0/quotes', {
        method: 'POST',
        headers: actorHeaders({ 'x-tenant-id': 'tenant-other' }),
        body: JSON.stringify({ id: 'q-http-mismatch', customerId: 'customer-1', numberSequence: 1 }),
      }));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        code: 'TENANT_MISMATCH',
        message: 'Tenant header does not match environment tenant',
      });
    });
  });

  it('accepts optional representedCompanyId without requiring it', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const quoteRepository = new InMemoryQuoteRepository();
      const orderRepository = new InMemoryOrderRepository();
      const api = createMinimalHttpApi({ quoteRepository, orderRepository });

      const createResponse = await api(new Request('http://localhost/v0/quotes', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({
          id: 'q-http-represented-1',
          representedCompanyId: 'represented-1',
          customerId: 'customer-1',
          numberSequence: 46,
        }),
      }));

      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as { representedCompanyId?: string };
      expect(created.representedCompanyId).toBe('represented-1');

      const confirmResponse = await api(new Request('http://localhost/v0/quotes/q-http-represented-1/confirm', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ orderSequence: 100 }),
      }));

      expect(confirmResponse.status).toBe(200);
      const confirmed = (await confirmResponse.json()) as { representedCompanyId?: string; sourceQuoteSnapshot?: { represented_company_id?: string } };
      expect(confirmed.representedCompanyId).toBe('represented-1');
      expect(confirmed.sourceQuoteSnapshot?.represented_company_id).toBe('represented-1');
    });
  });

  it('does not allow missing actor headers', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
      });

      const response = await api(new Request('http://localhost/v0/quotes', { method: 'POST' }));
      expect(response.status).toBe(401);
    });
  });

  it('fails fast when APP_TENANT_ID is missing', () => {
    delete process.env.APP_TENANT_ID;
    try {
      expect(() => createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
      })).toThrow('APP_TENANT_ID is required to resolve runtime tenant.');
    } finally {
      if (ORIGINAL_APP_TENANT_ID !== undefined) process.env.APP_TENANT_ID = ORIGINAL_APP_TENANT_ID;
    }
  });

  it('returns canonical 503 when database dependency is unavailable', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const dbError = new Error('connect ECONNREFUSED 127.0.0.1:5432') as Error & { code?: string };
      dbError.code = '57P03';
      const api = createMinimalHttpApi({
        quoteRepository: {
          save: async () => {
            throw dbError;
          },
          getById: async () => null,
        },
        orderRepository: {
          save: async () => undefined,
          saveFromQuoteOnce: async () => ({ ok: true }),
          getById: async () => null,
          getBySourceQuoteId: async () => null,
        },
      });

      const response = await api(
        new Request('http://localhost/v0/quotes', {
          method: 'POST',
          headers: actorHeaders(),
          body: JSON.stringify({ id: 'q-http-db-down', customerId: 'c-1', numberSequence: 1 }),
        })
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database dependency unavailable',
      });
    });
  });
});
