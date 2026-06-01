import { describe, expect, it } from 'vitest';
import { createMinimalHttpApi, InMemoryOrderRepository, InMemoryQuoteRepository } from '../src/index.js';

function actorHeaders() {
  return {
    'x-actor-role': 'ADMIN',
    'x-actor-id': 'admin-1',
    'x-tenant-id': 'tenant-1',
    'content-type': 'application/json',
  };
}

describe('minimal HTTP API', () => {
  it('creates quote and confirms into order using use cases', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();
    const api = createMinimalHttpApi({ quoteRepository, orderRepository });

    const createResponse = await api(
      new Request('http://localhost/v0/quotes', {
        method: 'POST',
        headers: actorHeaders(),
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

    const confirmResponse = await api(
      new Request('http://localhost/v0/quotes/q-http-1/confirm', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ orderSequence: 99 }),
      })
    );

    expect(confirmResponse.status).toBe(200);
    const confirmed = (await confirmResponse.json()) as { status: string; source_quote_id: string };
    expect(confirmed.status).toBe('ORDER_CONFIRMED');
    expect(confirmed.source_quote_id).toBe('q-http-1');
  });

  it('does not allow missing actor headers', async () => {
    const api = createMinimalHttpApi({
      quoteRepository: new InMemoryQuoteRepository(),
      orderRepository: new InMemoryOrderRepository(),
    });

    const response = await api(new Request('http://localhost/v0/quotes', { method: 'POST' }));
    expect(response.status).toBe(401);
  });

  it('returns canonical 503 when database dependency is unavailable', async () => {
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
