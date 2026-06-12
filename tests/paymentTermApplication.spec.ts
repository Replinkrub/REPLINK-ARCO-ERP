import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryPaymentTermRepository,
  createPaymentTermUseCase,
  getPaymentTermUseCase,
  listPaymentTermsUseCase,
  updatePaymentTermUseCase,
} from '../src/index.js';

describe('payment term application flow', () => {
  it('creates, lists, gets and updates payment term foundation records', async () => {
    const repository = new InMemoryPaymentTermRepository();
    const actor = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };

    const created = await createPaymentTermUseCase(
      { paymentTermRepository: repository },
      {
        actor,
        payload: {
          id: 'payment-term-app-1',
          name: '30/60/90',
          description: 'Três parcelas',
          installments_count: 3,
          first_due_days: 30,
          interval_days: 30,
        },
        now: new Date('2026-01-01T00:00:00.000Z'),
      }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data).toMatchObject({ status: 'active', installmentsCount: 3, firstDueDays: 30, intervalDays: 30 });

    const list = await listPaymentTermsUseCase({ paymentTermRepository: repository }, { actor, q: '30/60' });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.items).toHaveLength(1);

    const fetched = await getPaymentTermUseCase({ paymentTermRepository: repository }, { actor, paymentTermId: 'payment-term-app-1' });
    expect(fetched.ok).toBe(true);

    const updated = await updatePaymentTermUseCase(
      { paymentTermRepository: repository },
      { actor, paymentTermId: 'payment-term-app-1', payload: { name: '30/60', installments_count: 2, status: 'inactive' } }
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data).toMatchObject({ name: '30/60', installmentsCount: 2, status: 'inactive' });
  });

  it('validates required fields, numeric constraints, duplicate name and role writes', async () => {
    const repository = new InMemoryPaymentTermRepository([
      { id: 'payment-term-1', tenantId: 'tenant-1', name: 'À vista', installmentsCount: 1, firstDueDays: 0, intervalDays: 0 },
    ]);
    const admin = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };
    const representative = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

    const missing = await createPaymentTermUseCase({ paymentTermRepository: repository }, { actor: admin, payload: { name: 'Sem parcelas' } });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const invalidNumber = await createPaymentTermUseCase(
      { paymentTermRepository: repository },
      { actor: admin, payload: { name: 'Inválida', installments_count: 0, first_due_days: 0, interval_days: 0 } }
    );
    expect(invalidNumber.ok).toBe(false);
    if (!invalidNumber.ok) expect(invalidNumber.error.details?.field).toBe('installments_count');

    const outOfScope = await createPaymentTermUseCase(
      { paymentTermRepository: repository },
      { actor: admin, payload: { id: 'payment-term-out', name: 'Fora', installments_count: 1, first_due_days: 0, interval_days: 0, installments: [] } }
    );
    expect(outOfScope.ok).toBe(false);
    if (!outOfScope.ok) expect(outOfScope.error.details?.field).toBe('installments');

    const duplicate = await createPaymentTermUseCase(
      { paymentTermRepository: repository },
      { actor: admin, payload: { id: 'payment-term-dup', name: 'À vista', installments_count: 1, first_due_days: 0, interval_days: 0 } }
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe(APPLICATION_ERROR_CODES.DUPLICATE_PAYMENT_TERM);

    const representativeCreate = await createPaymentTermUseCase(
      { paymentTermRepository: repository },
      { actor: representative, payload: { id: 'payment-term-rep', name: 'Rep', installments_count: 1, first_due_days: 0, interval_days: 0 } }
    );
    expect(representativeCreate.ok).toBe(false);
    if (!representativeCreate.ok) expect(representativeCreate.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
  });

  it('allows representative reads within tenant and hides cross-tenant records', async () => {
    const repository = new InMemoryPaymentTermRepository([
      { id: 'payment-term-tenant-1', tenantId: 'tenant-1', name: 'T1', installmentsCount: 1, firstDueDays: 0, intervalDays: 0 },
      { id: 'payment-term-tenant-2', tenantId: 'tenant-2', name: 'T2', installmentsCount: 1, firstDueDays: 0, intervalDays: 0 },
    ]);
    const representative = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

    const list = await listPaymentTermsUseCase({ paymentTermRepository: repository }, { actor: representative });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.items.map((item) => item.id)).toEqual(['payment-term-tenant-1']);

    const hidden = await getPaymentTermUseCase({ paymentTermRepository: repository }, { actor: representative, paymentTermId: 'payment-term-tenant-2' });
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.error.code).toBe(APPLICATION_ERROR_CODES.PAYMENT_TERM_NOT_FOUND);
  });
});
