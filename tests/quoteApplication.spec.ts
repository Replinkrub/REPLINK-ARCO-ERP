import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryOrderRepository,
  InMemoryQuoteRepository,
  confirmQuoteUseCase,
  convertQuoteToOrder,
  createQuote,
  createQuoteUseCase,
  getRequiresRepresentedCompany,
  updateQuote,
} from '../src/index.js';

describe('quote application flow', () => {
  it('represented company enforcement config only enables exact true', () => {
    expect(getRequiresRepresentedCompany({ APP_REQUIRES_REPRESENTED_COMPANY: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(getRequiresRepresentedCompany({} as NodeJS.ProcessEnv)).toBe(false);
    expect(getRequiresRepresentedCompany({ APP_REQUIRES_REPRESENTED_COMPANY: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(getRequiresRepresentedCompany({ APP_REQUIRES_REPRESENTED_COMPANY: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(getRequiresRepresentedCompany({ APP_REQUIRES_REPRESENTED_COMPANY: '' } as NodeJS.ProcessEnv)).toBe(false);
    expect(getRequiresRepresentedCompany({ APP_REQUIRES_REPRESENTED_COMPANY: 'TRUE' } as NodeJS.ProcessEnv)).toBe(false);
  });

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

  it('createQuote preserva representedCompanyId opcional', async () => {
    const repository = new InMemoryQuoteRepository();

    const result = await createQuoteUseCase(
      { quoteRepository: repository },
      {
        id: 'q-represented-1',
        tenantId: 'tenant-1',
        representedCompanyId: 'represented-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
        numberSequence: 14,
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.representedCompanyId).toBe('represented-1');

    const reloaded = await repository.getById('q-represented-1');
    expect(reloaded?.representedCompanyId).toBe('represented-1');
  });

  it('createQuote keeps representedCompanyId optional when enforcement is disabled', async () => {
    const repository = new InMemoryQuoteRepository();

    const result = await createQuoteUseCase(
      { quoteRepository: repository },
      {
        id: 'q-represented-optional',
        tenantId: 'tenant-1',
        requiresRepresentedCompany: false,
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.representedCompanyId).toBeUndefined();
  });

  it('createQuote requires representedCompanyId when enforcement is enabled', async () => {
    const repository = new InMemoryQuoteRepository();

    const result = await createQuoteUseCase(
      { quoteRepository: repository },
      {
        id: 'q-represented-required',
        tenantId: 'tenant-1',
        requiresRepresentedCompany: true,
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.REQUIRED_REPRESENTED_COMPANY);
    }
  });

  it('createQuote treats blank representedCompanyId as missing when enforcement is enabled', async () => {
    const repository = new InMemoryQuoteRepository();

    const result = await createQuoteUseCase(
      { quoteRepository: repository },
      {
        id: 'q-represented-blank',
        tenantId: 'tenant-1',
        representedCompanyId: '   ',
        requiresRepresentedCompany: true,
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.REQUIRED_REPRESENTED_COMPANY);
    }
  });

  it('createQuote persists normalized representedCompanyId when enforcement is enabled', async () => {
    const repository = new InMemoryQuoteRepository();

    const result = await createQuoteUseCase(
      { quoteRepository: repository },
      {
        id: 'q-represented-normalized',
        tenantId: 'tenant-1',
        representedCompanyId: ' represented-1 ',
        requiresRepresentedCompany: true,
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.representedCompanyId).toBe('represented-1');

    const reloaded = await repository.getById('q-represented-normalized');
    expect(reloaded?.representedCompanyId).toBe('represented-1');
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

  it('updateQuote updates updatedAt when only customerId changes', async () => {
    const repository = new InMemoryQuoteRepository();
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    const created = await createQuoteUseCase(
      { quoteRepository: repository },
      {
        id: 'q-updated-at',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
        numberSequence: 13,
        now: createdAt,
      }
    );
    if (!created.ok) return;

    const result = await updateQuote(
      { quoteRepository: repository },
      {
        id: 'q-updated-at',
        customerId: 'customer-2',
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.createdAt.getTime()).toBe(createdAt.getTime());
    expect(result.data.updatedAt.getTime()).not.toBe(createdAt.getTime());
    expect(result.data.updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
    expect(result.data.documentType).toBe('quote');
    expect(result.data.status).toBe('QUOTE_DRAFT');
    expect(result.data.number).toBe('ORC-000013');
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

  it('F-03: confirma quote e gera order confirmado com source_quote_id', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    await createQuoteUseCase(
      { quoteRepository },
      {
        id: 'q-confirm-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
        numberSequence: 7,
      }
    );

    const result = await confirmQuoteUseCase(
      { quoteRepository, orderRepository },
      {
        quoteId: 'q-confirm-1',
        actor: { role: 'REPRESENTANTE', actorId: 'rep-1', actorTenantId: 'tenant-1' },
        orderSequence: 91,
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.documentType).toBe('order');
    expect(result.data.id).not.toBe('q-confirm-1');
    expect(result.data.status).toBe('ORDER_CONFIRMED');
    expect(result.data.number).toBe('PED-000091');
    expect(result.data.source_quote_id).toBe('q-confirm-1');
    expect(result.data.confirmedAt).toBeInstanceOf(Date);

    const persistedOrder = await orderRepository.getBySourceQuoteId('q-confirm-1');
    expect(persistedOrder?.id).toBe(result.data.id);
    expect(persistedOrder?.documentType).toBe('order');

    const originalQuote = await quoteRepository.getById('q-confirm-1');
    expect(originalQuote?.id).toBe('q-confirm-1');
    expect(originalQuote?.documentType).toBe('quote');
    expect(originalQuote?.status).toBe('QUOTE_DRAFT');
    expect(originalQuote?.number).toBe('ORC-000007');
  });

  it('F-04: confirmações concorrentes geram 1 sucesso + 1 conflito', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    await createQuoteUseCase(
      { quoteRepository },
      {
        id: 'q-race-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    const payload = {
      quoteId: 'q-race-1',
      actor: { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' },
      orderSequence: 92,
    };

    const [first, second] = await Promise.all([
      confirmQuoteUseCase({ quoteRepository, orderRepository }, payload),
      confirmQuoteUseCase({ quoteRepository, orderRepository }, payload),
    ]);

    const successes = [first, second].filter((result) => result.ok);
    const failures = [first, second].filter((result) => !result.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (!failures[0].ok) {
      expect(failures[0].error.code).toBe(APPLICATION_ERROR_CODES.CONFLICT_ALREADY_CONFIRMED);
    }
  });

  it('confirmQuote retorna FORBIDDEN para representante fora da carteira/tenant', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    await createQuoteUseCase(
      { quoteRepository },
      {
        id: 'q-forbidden-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    const outOfWallet = await confirmQuoteUseCase(
      { quoteRepository, orderRepository },
      {
        quoteId: 'q-forbidden-1',
        actor: { role: 'REPRESENTANTE', actorId: 'rep-2', actorTenantId: 'tenant-1' },
        orderSequence: 93,
      }
    );

    expect(outOfWallet.ok).toBe(false);
    if (!outOfWallet.ok) {
      expect(outOfWallet.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
    }
  });

  it('confirmQuote retorna FORBIDDEN para tenant mismatch sem criar order nem converter quote', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    await createQuoteUseCase(
      { quoteRepository },
      {
        id: 'q-forbidden-tenant-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    const result = await confirmQuoteUseCase(
      { quoteRepository, orderRepository },
      {
        quoteId: 'q-forbidden-tenant-1',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-2' },
        orderSequence: 95,
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
    }

    const persistedOrder = await orderRepository.getBySourceQuoteId('q-forbidden-tenant-1');
    expect(persistedOrder).toBeNull();

    const originalQuote = await quoteRepository.getById('q-forbidden-tenant-1');
    expect(originalQuote?.documentType).toBe('quote');
    expect(originalQuote?.status).toBe('QUOTE_DRAFT');
    expect(originalQuote?.outputEvents).toHaveLength(0);
    expect(originalQuote?.lifecycleEvents).toHaveLength(0);
  });

  it('confirmQuote retorna DOCUMENT_NOT_FOUND para quote inexistente', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    const result = await confirmQuoteUseCase(
      { quoteRepository, orderRepository },
      {
        quoteId: 'missing-quote',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        orderSequence: 94,
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND);
    }
  });

  it('confirmQuote retorna VALIDATION_ERROR para quoteId vazio ou em branco', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    const empty = await confirmQuoteUseCase(
      { quoteRepository, orderRepository },
      {
        quoteId: '',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        orderSequence: 1,
      }
    );

    const blank = await confirmQuoteUseCase(
      { quoteRepository, orderRepository },
      {
        quoteId: '   ',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        orderSequence: 1,
      }
    );

    expect(empty.ok).toBe(false);
    expect(blank.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
    }
    if (!blank.ok) {
      expect(blank.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
    }
  });

  it('confirmQuote retorna VALIDATION_ERROR para orderSequence inválido', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    await createQuoteUseCase(
      { quoteRepository },
      {
        id: 'q-invalid-seq',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    const invalidSequences = [0, -1, 1.5];
    for (const orderSequence of invalidSequences) {
      const result = await confirmQuoteUseCase(
        { quoteRepository, orderRepository },
        {
          quoteId: 'q-invalid-seq',
          actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
          orderSequence,
        }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
      }
    }
  });
});
