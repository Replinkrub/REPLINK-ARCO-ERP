import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryCustomerCommercialProfileRepository,
  InMemoryCustomerRepository,
  InMemoryPaymentTermRepository,
  InMemoryPriceTableRepository,
  getCustomerCommercialProfileUseCase,
  updateCustomerCommercialProfileUseCase,
} from '../src/index.js';

const admin = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };
const representative = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

function deps() {
  return {
    customerRepository: new InMemoryCustomerRepository([
      { id: 'customer-1', tenantId: 'tenant-1', status: 'active', legalName: 'Cliente 1', documentType: 'cnpj', documentNumber: 'C1', ownerId: 'rep-1', representativeId: 'rep-1' },
      { id: 'customer-2', tenantId: 'tenant-1', status: 'active', legalName: 'Cliente 2', documentType: 'cnpj', documentNumber: 'C2', ownerId: 'rep-2', representativeId: 'rep-2' },
    ]),
    priceTableRepository: new InMemoryPriceTableRepository([
      { id: 'price-table-global', tenantId: 'tenant-1', name: 'Global', validFrom: '2026-01-01' },
      { id: 'price-table-rep', tenantId: 'tenant-1', representedCompanyId: 'represented-1', name: 'Rep', validFrom: '2026-01-01' },
      { id: 'price-table-inactive', tenantId: 'tenant-1', name: 'Inactive', validFrom: '2026-01-01', status: 'inactive' },
      { id: 'price-table-other-tenant', tenantId: 'tenant-2', name: 'Other', validFrom: '2026-01-01' },
    ]),
    paymentTermRepository: new InMemoryPaymentTermRepository([
      { id: 'payment-term-active', tenantId: 'tenant-1', name: '30/60', installmentsCount: 2, firstDueDays: 30, intervalDays: 30 },
      { id: 'payment-term-inactive', tenantId: 'tenant-1', name: 'Inativa', installmentsCount: 1, firstDueDays: 0, intervalDays: 0, status: 'inactive' },
      { id: 'payment-term-other-tenant', tenantId: 'tenant-2', name: 'Outro tenant', installmentsCount: 1, firstDueDays: 0, intervalDays: 0 },
    ]),
    customerCommercialProfileRepository: new InMemoryCustomerCommercialProfileRepository(),
  };
}

describe('customer commercial profile default price table flow', () => {
  it('gets empty profile, sets a global default and clears it', async () => {
    const repositories = deps();

    const empty = await getCustomerCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1' });
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.data.defaultPriceTableId).toBeNull();

    const updated = await updateCustomerCommercialProfileUseCase(repositories, {
      actor: admin,
      customerId: 'customer-1',
      payload: { default_price_table_id: 'price-table-global' },
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data.defaultPriceTableId).toBe('price-table-global');

    const cleared = await updateCustomerCommercialProfileUseCase(repositories, {
      actor: admin,
      customerId: 'customer-1',
      payload: { default_price_table_id: null },
    });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.data.defaultPriceTableId).toBeNull();
  });

  it('sets and clears an active default payment term from the same tenant', async () => {
    const repositories = deps();

    const updated = await updateCustomerCommercialProfileUseCase(repositories, {
      actor: admin,
      customerId: 'customer-1',
      payload: { default_payment_term_id: 'payment-term-active' },
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.data.defaultPaymentTermId).toBe('payment-term-active');
      expect(updated.data.defaultPriceTableId).toBeNull();
    }

    const cleared = await updateCustomerCommercialProfileUseCase(repositories, {
      actor: admin,
      customerId: 'customer-1',
      payload: { default_payment_term_id: null },
    });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.data.defaultPaymentTermId).toBeNull();
  });

  it('validates missing entities, inactive tables, represented tables and out-of-scope fields', async () => {
    const repositories = deps();

    const missingCustomer = await updateCustomerCommercialProfileUseCase(repositories, { actor: admin, customerId: 'missing', payload: { default_price_table_id: 'price-table-global' } });
    expect(missingCustomer.ok).toBe(false);
    if (!missingCustomer.ok) expect(missingCustomer.error.code).toBe(APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND);

    const missingTable = await updateCustomerCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', payload: { default_price_table_id: 'missing-table' } });
    expect(missingTable.ok).toBe(false);
    if (!missingTable.ok) expect(missingTable.error.code).toBe(APPLICATION_ERROR_CODES.PRICE_TABLE_NOT_FOUND);

    const inactiveTable = await updateCustomerCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', payload: { default_price_table_id: 'price-table-inactive' } });
    expect(inactiveTable.ok).toBe(false);
    if (!inactiveTable.ok) expect(inactiveTable.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const representedTable = await updateCustomerCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', payload: { default_price_table_id: 'price-table-rep' } });
    expect(representedTable.ok).toBe(false);
    if (!representedTable.ok) expect(representedTable.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const crossTenantTable = await updateCustomerCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', payload: { default_price_table_id: 'price-table-other-tenant' } });
    expect(crossTenantTable.ok).toBe(false);
    if (!crossTenantTable.ok) expect(crossTenantTable.error.code).toBe(APPLICATION_ERROR_CODES.PRICE_TABLE_NOT_FOUND);

    const missingPaymentTerm = await updateCustomerCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', payload: { default_payment_term_id: 'missing-term' } });
    expect(missingPaymentTerm.ok).toBe(false);
    if (!missingPaymentTerm.ok) expect(missingPaymentTerm.error.code).toBe(APPLICATION_ERROR_CODES.PAYMENT_TERM_NOT_FOUND);

    const inactivePaymentTerm = await updateCustomerCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', payload: { default_payment_term_id: 'payment-term-inactive' } });
    expect(inactivePaymentTerm.ok).toBe(false);
    if (!inactivePaymentTerm.ok) expect(inactivePaymentTerm.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const crossTenantPaymentTerm = await updateCustomerCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', payload: { default_payment_term_id: 'payment-term-other-tenant' } });
    expect(crossTenantPaymentTerm.ok).toBe(false);
    if (!crossTenantPaymentTerm.ok) expect(crossTenantPaymentTerm.error.code).toBe(APPLICATION_ERROR_CODES.PAYMENT_TERM_NOT_FOUND);

    const outOfScope = await updateCustomerCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', payload: { default_price_table_id: 'price-table-global', represented_company_id: 'represented-1' } });
    expect(outOfScope.ok).toBe(false);
    if (!outOfScope.ok) expect(outOfScope.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
  });

  it('allows representative reads but not writes and preserves customer visibility', async () => {
    const repositories = deps();

    const read = await getCustomerCommercialProfileUseCase(repositories, { actor: representative, customerId: 'customer-1' });
    expect(read.ok).toBe(true);

    const hidden = await getCustomerCommercialProfileUseCase(repositories, { actor: representative, customerId: 'customer-2' });
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.error.code).toBe(APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND);

    const write = await updateCustomerCommercialProfileUseCase(repositories, { actor: representative, customerId: 'customer-1', payload: { default_price_table_id: 'price-table-global' } });
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
  });
});
