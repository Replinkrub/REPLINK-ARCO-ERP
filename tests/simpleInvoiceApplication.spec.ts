import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryOrderRepository,
  InMemoryQuoteRepository,
  cancelOrderUseCase,
  confirmQuoteUseCase,
  createQuoteUseCase,
  registerSimpleInvoiceUseCase,
} from '../src/index.js';

async function createConfirmedOrderForInvoice() {
  const quoteRepository = new InMemoryQuoteRepository();
  const orderRepository = new InMemoryOrderRepository();

  await createQuoteUseCase(
    { quoteRepository },
    {
      id: 'q-invoice-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
    }
  );

  const confirmed = await confirmQuoteUseCase(
    { quoteRepository, orderRepository },
    {
      quoteId: 'q-invoice-1',
      actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
      orderSequence: 501,
    }
  );

  return { quoteRepository, orderRepository, confirmed };
}

describe('simple invoice application flow', () => {
  it('registra faturamento simples com ADMIN e muda status para INVOICED', async () => {
    const { orderRepository, confirmed } = await createConfirmedOrderForInvoice();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const invoiced = await registerSimpleInvoiceUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        manualReference: 'NF-MANUAL-001',
      }
    );

    expect(invoiced.ok).toBe(true);
    if (!invoiced.ok) throw new Error(invoiced.error.message);

    expect(invoiced.data.documentType).toBe('order');
    expect(invoiced.data.status).toBe('INVOICED');
    expect(invoiced.data.invoicedAt).toBeInstanceOf(Date);
    expect(invoiced.data.invoiceManualReference).toBe('NF-MANUAL-001');

    const persisted = await orderRepository.getById(confirmed.data.id);
    expect(persisted?.status).toBe('INVOICED');
    expect(persisted?.invoiceManualReference).toBe('NF-MANUAL-001');
  });

  it('bloqueia faturamento para REPRESENTANTE com FORBIDDEN', async () => {
    const { orderRepository, confirmed } = await createConfirmedOrderForInvoice();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const denied = await registerSimpleInvoiceUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'REPRESENTANTE', actorId: 'rep-1', actorTenantId: 'tenant-1' },
      }
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
    }
  });

  it('retorna DOCUMENT_NOT_FOUND para pedido inexistente', async () => {
    const orderRepository = new InMemoryOrderRepository();

    const result = await registerSimpleInvoiceUseCase(
      { orderRepository },
      {
        orderId: 'missing-order',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND);
    }
  });

  it('retorna FORBIDDEN para tenant mismatch', async () => {
    const { orderRepository, confirmed } = await createConfirmedOrderForInvoice();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const denied = await registerSimpleInvoiceUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'ADMIN', actorId: 'admin-2', actorTenantId: 'tenant-2' },
      }
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
    }
  });

  it('retorna VALIDATION_ERROR para orderId vazio', async () => {
    const orderRepository = new InMemoryOrderRepository();

    const result = await registerSimpleInvoiceUseCase(
      { orderRepository },
      {
        orderId: '   ',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
    }
  });

  it('bloqueia faturamento quando pedido não está em ORDER_CONFIRMED', async () => {
    const { orderRepository, confirmed } = await createConfirmedOrderForInvoice();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const canceled = await cancelOrderUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        reason: 'CLIENTE_DESISTIU',
      }
    );
    expect(canceled.ok).toBe(true);
    if (!canceled.ok) throw new Error(canceled.error.message);

    const denied = await registerSimpleInvoiceUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
      }
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED);
    }

    const persisted = await orderRepository.getById(confirmed.data.id);
    expect(persisted?.status).toBe('CANCELED');
    expect(persisted?.invoicedAt).toBeUndefined();
  });
});
