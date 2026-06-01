import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryOrderRepository,
  InMemoryQuoteRepository,
  adjustOrderUseCase,
  cancelOrderUseCase,
  confirmQuoteUseCase,
  createQuoteUseCase,
} from '../src/index.js';

async function createConfirmedOrder() {
  const quoteRepository = new InMemoryQuoteRepository();
  const orderRepository = new InMemoryOrderRepository();

  await createQuoteUseCase(
    { quoteRepository },
    {
      id: 'q-order-close-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
    }
  );

  const confirmed = await confirmQuoteUseCase(
    { quoteRepository, orderRepository },
    {
      quoteId: 'q-order-close-1',
      actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
      orderSequence: 401,
    }
  );

  return { quoteRepository, orderRepository, confirmed };
}

describe('order closure application flow', () => {
  it('cancela order confirmado com ADMIN e mantém trilha de cancelamento', async () => {
    const { orderRepository, confirmed } = await createConfirmedOrder();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const canceled = await cancelOrderUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        reason: 'CLIENTE_DESISTIU',
        note: 'cliente pediu cancelamento',
      }
    );

    expect(canceled.ok).toBe(true);
    if (!canceled.ok) throw new Error(canceled.error.message);

    expect(canceled.data.documentType).toBe('order');
    expect(canceled.data.status).toBe('CANCELED');
    expect(canceled.data.canceledAt).toBeInstanceOf(Date);
    expect(canceled.data.cancelReason).toBe('CLIENTE_DESISTIU');

    const persisted = await orderRepository.getById(confirmed.data.id);
    expect(persisted?.status).toBe('CANCELED');
  });

  it('bloqueia cancelamento de order confirmado para REPRESENTANTE com FORBIDDEN', async () => {
    const { orderRepository, confirmed } = await createConfirmedOrder();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const denied = await cancelOrderUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'REPRESENTANTE', actorId: 'rep-1', actorTenantId: 'tenant-1' },
        reason: 'CLIENTE_DESISTIU',
      }
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
    }
  });

  it('aplica ajuste administrativo em ORDER_CONFIRMED sem alterar status comercial', async () => {
    const { orderRepository, confirmed } = await createConfirmedOrder();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const adjusted = await adjustOrderUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        reason: 'AJUSTE_PRECO',
        note: 'ajuste operacional',
        changes: {
          items: [
            {
              id: 'adj-1',
              sku: 'SKU-ADJ-1',
              description: 'Item ajustado',
              quantity: 2,
              unitPrice: 50,
              discount: 10,
              total: 90,
            },
          ],
          totals: {
            itemsCount: 1,
            subtotal: 100,
            discountTotal: 10,
            total: 90,
          },
        },
      }
    );

    expect(adjusted.ok).toBe(true);
    if (!adjusted.ok) throw new Error(adjusted.error.message);

    expect(adjusted.data.documentType).toBe('order');
    expect(adjusted.data.status).toBe('ORDER_CONFIRMED');
    expect(adjusted.data.orderRevisions).toHaveLength(1);
    expect(adjusted.data.lifecycleEvents.at(-1)?.type).toBe('ORDER_ADJUSTED');
  });

  it('bloqueia ajuste para REPRESENTANTE com FORBIDDEN', async () => {
    const { orderRepository, confirmed } = await createConfirmedOrder();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const denied = await adjustOrderUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'REPRESENTANTE', actorId: 'rep-1', actorTenantId: 'tenant-1' },
        reason: 'AJUSTE_PRECO',
        note: 'tentativa sem permissão',
        changes: {
          totals: { total: 1 },
        },
      }
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
    }
  });

  it('retorna DOCUMENT_NOT_FOUND para order inexistente', async () => {
    const orderRepository = new InMemoryOrderRepository();

    const result = await cancelOrderUseCase(
      { orderRepository },
      {
        orderId: 'missing-order',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        reason: 'CLIENTE_DESISTIU',
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND);
    }
  });

  it('retorna FORBIDDEN para tenant mismatch em ajuste', async () => {
    const { orderRepository, confirmed } = await createConfirmedOrder();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const denied = await adjustOrderUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'ADMIN', actorId: 'admin-2', actorTenantId: 'tenant-2' },
        reason: 'AJUSTE_PRECO',
        note: 'tenant mismatch',
      }
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
    }
  });

  it('retorna VALIDATION_ERROR para orderId vazio e motivos inválidos', async () => {
    const { orderRepository, confirmed } = await createConfirmedOrder();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const missingId = await cancelOrderUseCase(
      { orderRepository },
      {
        orderId: '   ',
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        reason: 'CLIENTE_DESISTIU',
      }
    );
    expect(missingId.ok).toBe(false);
    if (!missingId.ok) {
      expect(missingId.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
    }

    const invalidCancelReason = await cancelOrderUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        reason: 'INVALID_REASON',
      }
    );
    expect(invalidCancelReason.ok).toBe(false);
    if (!invalidCancelReason.ok) {
      expect(invalidCancelReason.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
    }

    const invalidAdjustReason = await adjustOrderUseCase(
      { orderRepository },
      {
        orderId: confirmed.data.id,
        actor: { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' },
        reason: 'INVALID_REASON',
      }
    );
    expect(invalidAdjustReason.ok).toBe(false);
    if (!invalidAdjustReason.ok) {
      expect(invalidAdjustReason.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
    }
  });
});
