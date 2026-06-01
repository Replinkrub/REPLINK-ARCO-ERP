import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryQuoteRepository,
  convertQuoteToOrder,
  createQuote,
  createQuoteUseCase,
  updateQuote,
} from '../src/index.js';

describe('quote application flow', () => {
  it('createQuote exige customerId obrigatório', async () => {
    const repository = new InMemoryQuoteRepository();

    const result = await createQuoteUseCase(
      { quoteRepository: repository },
      {
        id: 'q-customer-required',
        tenantId: 'tenant-1',
        customerId: '   ',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.REQUIRED_CUSTOMER_ID);
    }
  });

  it('createQuote cria QUOTE_DRAFT com número ORC e persiste', async () => {
    const repository = new InMemoryQuoteRepository();

    const result = await createQuoteUseCase(
      { quoteRepository: repository },
      {
        id: 'q-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
        numberSequence: 12,
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.status).toBe('QUOTE_DRAFT');
    expect(result.data.number).toBe('ORC-000012');
    expect(result.data.customerId).toBe('customer-1');

    const reloaded = await repository.getById('q-1');
    expect(reloaded?.number).toBe('ORC-000012');
    expect(reloaded?.status).toBe('QUOTE_DRAFT');
  });

  it('updateQuote mantém documentType quote e atualiza itens/customerId', async () => {
    const repository = new InMemoryQuoteRepository();

    await createQuoteUseCase(
      { quoteRepository: repository },
      {
        id: 'q-2',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    const updated = await updateQuote(
      { quoteRepository: repository },
      {
        id: 'q-2',
        customerId: 'customer-2',
        addItems: [{ id: 'i-1', sku: 'SKU-1', description: 'Item 1', quantity: 2, unitPrice: 100, discount: 10 }],
      }
    );

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    expect(updated.data.documentType).toBe('quote');
    expect(updated.data.status).toBe('QUOTE_DRAFT');
    expect(updated.data.customerId).toBe('customer-2');
    expect(updated.data.totals.total).toBe(190);
  });

  it('updateQuote falha para orçamento inexistente', async () => {
    const repository = new InMemoryQuoteRepository();

    const result = await updateQuote(
      { quoteRepository: repository },
      {
        id: 'missing',
        customerId: 'customer-2',
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND);
    }
  });

  it('updateQuote rejeita documento que não seja quote', async () => {
    const quote = createQuote({
      id: 'q-not-quote',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 2,
    });
    const converted = convertQuoteToOrder(quote, 100);
    if (!converted.ok) return;

    const fakeRepository = {
      save: async () => undefined,
      getById: async () => converted.document,
    };

    const result = await updateQuote(
      { quoteRepository: fakeRepository },
      {
        id: 'q-not-quote',
        customerId: 'customer-2',
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.DOCUMENT_NOT_QUOTE);
    }
  });

  it('repositório in-memory rejeita documento que não seja quote', async () => {
    const repository = new InMemoryQuoteRepository();

    const quote = createQuote({
      id: 'q-converted',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 2,
    });
    const converted = convertQuoteToOrder(quote, 100);
    if (!converted.ok) return;

    await expect(repository.save(converted.document)).rejects.toThrowError('QUOTE_REPOSITORY_ONLY_ACCEPTS_QUOTES');
  });

  it('fluxo in-memory ponta a ponta: create -> update -> reload', async () => {
    const repository = new InMemoryQuoteRepository();

    const created = await createQuoteUseCase(
      { quoteRepository: repository },
      {
        id: 'q-flow',
        tenantId: 'tenant-1',
        customerId: 'customer-flow',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
        numberSequence: 55,
      }
    );
    if (!created.ok) return;

    const updated = await updateQuote(
      { quoteRepository: repository },
      {
        id: 'q-flow',
        addItems: [{ id: 'i-flow', sku: 'SKU-FLOW', description: 'Flow Item', quantity: 3, unitPrice: 40, discount: 0 }],
      }
    );
    if (!updated.ok) return;

    const reloaded = await repository.getById('q-flow');
    expect(reloaded).not.toBeNull();
    expect(reloaded?.number).toBe('ORC-000055');
    expect(reloaded?.status).toBe('QUOTE_DRAFT');
    expect(reloaded?.documentType).toBe('quote');
    expect(reloaded?.totals.total).toBe(120);
  });
});
