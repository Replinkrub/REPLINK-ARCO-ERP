import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryOrderRepository,
  InMemoryQuoteRepository,
  confirmQuoteUseCase,
  createQuoteUseCase,
  registerDocumentCommunicationUseCase,
} from '../src/index.js';

describe('document communication application flow', () => {
  it('registra comunicação em quote sem alterar status e sem converter para order', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    await createQuoteUseCase(
      { quoteRepository },
      {
        id: 'q-comm-quote-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    const result = await registerDocumentCommunicationUseCase(
      { quoteRepository, orderRepository },
      {
        documentType: 'quote',
        documentId: 'q-comm-quote-1',
        actor: { role: 'REPRESENTANTE', actorId: 'rep-1', actorTenantId: 'tenant-1' },
        channel: 'SEND_EMAIL',
        event: 'envio de orçamento por e-mail',
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.documentType).toBe('quote');
    expect(result.data.status).toBe('QUOTE_DRAFT');
    expect(result.data.outputEvents).toHaveLength(1);
    expect(result.data.outputEvents[0]?.channel).toBe('SEND_EMAIL');

    const reloadedQuote = await quoteRepository.getById('q-comm-quote-1');
    expect(reloadedQuote?.documentType).toBe('quote');
    expect(reloadedQuote?.status).toBe('QUOTE_DRAFT');
    expect(reloadedQuote?.outputEvents).toHaveLength(1);

    const unintendedOrder = await orderRepository.getBySourceQuoteId('q-comm-quote-1');
    expect(unintendedOrder).toBeNull();
  });

  it('registra comunicação em order sem alterar status comercial atual', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    await createQuoteUseCase(
      { quoteRepository },
      {
        id: 'q-comm-order-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    const confirmed = await confirmQuoteUseCase(
      { quoteRepository, orderRepository },
      {
        quoteId: 'q-comm-order-1',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        orderSequence: 301,
      }
    );
    if (!confirmed.ok) return;

    const result = await registerDocumentCommunicationUseCase(
      { quoteRepository, orderRepository },
      {
        documentType: 'order',
        documentId: 'q-comm-order-1',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        channel: 'PRINT',
        event: 'impressão operacional',
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.documentType).toBe('order');
    expect(result.data.status).toBe('ORDER_CONFIRMED');
    expect(result.data.invoicedAt).toBeUndefined();
    expect(result.data.outputEvents).toHaveLength(1);
    expect(result.data.outputEvents[0]?.channel).toBe('PRINT');

    const reloadedOrder = await orderRepository.getById('q-comm-order-1');
    expect(reloadedOrder?.documentType).toBe('order');
    expect(reloadedOrder?.status).toBe('ORDER_CONFIRMED');
    expect(reloadedOrder?.invoicedAt).toBeUndefined();
    expect(reloadedOrder?.outputEvents).toHaveLength(1);
  });

  it('retorna DOCUMENT_NOT_FOUND para documento inexistente', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    const result = await registerDocumentCommunicationUseCase(
      { quoteRepository, orderRepository },
      {
        documentType: 'quote',
        documentId: 'missing-doc',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        channel: 'SHARE',
        event: 'compartilhar',
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND);
    }
  });

  it('retorna FORBIDDEN para tenant mismatch sem gerar output/lifecycle indevido', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    await createQuoteUseCase(
      { quoteRepository },
      {
        id: 'q-comm-forbidden-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        ownerId: 'owner-1',
        representativeId: 'rep-1',
      }
    );

    const denied = await registerDocumentCommunicationUseCase(
      { quoteRepository, orderRepository },
      {
        documentType: 'quote',
        documentId: 'q-comm-forbidden-1',
        actor: { role: 'ADMIN', actorId: 'admin-2', actorTenantId: 'tenant-2' },
        channel: 'SEND_WHATSAPP',
        event: 'tentativa inválida',
      }
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
    }

    const untouchedQuote = await quoteRepository.getById('q-comm-forbidden-1');
    expect(untouchedQuote?.outputEvents).toHaveLength(0);
    expect(untouchedQuote?.lifecycleEvents).toHaveLength(0);
    expect(untouchedQuote?.status).toBe('QUOTE_DRAFT');
  });

  it('retorna VALIDATION_ERROR para entradas inválidas', async () => {
    const quoteRepository = new InMemoryQuoteRepository();
    const orderRepository = new InMemoryOrderRepository();

    const invalidDocumentId = await registerDocumentCommunicationUseCase(
      { quoteRepository, orderRepository },
      {
        documentType: 'quote',
        documentId: '   ',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        channel: 'SEND_EMAIL',
        event: 'ok',
      }
    );
    expect(invalidDocumentId.ok).toBe(false);
    if (!invalidDocumentId.ok) {
      expect(invalidDocumentId.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
    }

    const invalidType = await registerDocumentCommunicationUseCase(
      { quoteRepository, orderRepository },
      {
        documentType: 'invoice',
        documentId: 'doc-1',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        channel: 'SEND_EMAIL',
        event: 'ok',
      }
    );
    expect(invalidType.ok).toBe(false);
    if (!invalidType.ok) {
      expect(invalidType.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
    }

    const invalidChannel = await registerDocumentCommunicationUseCase(
      { quoteRepository, orderRepository },
      {
        documentType: 'quote',
        documentId: 'doc-1',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        channel: 'SMS',
        event: 'ok',
      }
    );
    expect(invalidChannel.ok).toBe(false);
    if (!invalidChannel.ok) {
      expect(invalidChannel.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
    }

    const invalidEvent = await registerDocumentCommunicationUseCase(
      { quoteRepository, orderRepository },
      {
        documentType: 'quote',
        documentId: 'doc-1',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        channel: 'SEND_EMAIL',
        event: '   ',
      }
    );
    expect(invalidEvent.ok).toBe(false);
    if (!invalidEvent.ok) {
      expect(invalidEvent.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
    }
  });
});
