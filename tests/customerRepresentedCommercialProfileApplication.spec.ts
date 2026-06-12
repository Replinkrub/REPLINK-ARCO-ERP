import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryCustomerRepository,
  InMemoryCustomerRepresentedCommercialProfileRepository,
  InMemoryPaymentTermRepository,
  InMemoryPriceTableRepository,
  InMemoryRepresentedCompanyRepository,
  getCustomerRepresentedCommercialProfileUseCase,
  updateCustomerRepresentedCommercialProfileUseCase,
} from '../src/index.js';

const admin = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };
const representative = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

function deps() {
  return {
    customerRepository: new InMemoryCustomerRepository([
      { id: 'customer-1', tenantId: 'tenant-1', status: 'active', legalName: 'Cliente 1', documentType: 'cnpj', documentNumber: 'C1', ownerId: 'rep-1', representativeId: 'rep-1' },
      { id: 'customer-2', tenantId: 'tenant-1', status: 'active', legalName: 'Cliente 2', documentType: 'cnpj', documentNumber: 'C2', ownerId: 'rep-2', representativeId: 'rep-2' },
    ]),
    representedCompanyRepository: new InMemoryRepresentedCompanyRepository([
      { id: 'represented-1', tenantId: 'tenant-1', name: 'Representada 1' },
      { id: 'represented-2', tenantId: 'tenant-1', name: 'Representada 2' },
      { id: 'represented-inactive', tenantId: 'tenant-1', name: 'Inativa', status: 'inactive' },
    ]),
    priceTableRepository: new InMemoryPriceTableRepository([
      { id: 'price-table-global', tenantId: 'tenant-1', name: 'Global', validFrom: '2026-01-01' },
      { id: 'price-table-rep-1', tenantId: 'tenant-1', representedCompanyId: 'represented-1', name: 'Rep 1', validFrom: '2026-01-01' },
      { id: 'price-table-rep-2', tenantId: 'tenant-1', representedCompanyId: 'represented-2', name: 'Rep 2', validFrom: '2026-01-01' },
      { id: 'price-table-inactive', tenantId: 'tenant-1', name: 'Inactive', validFrom: '2026-01-01', status: 'inactive' },
    ]),
    paymentTermRepository: new InMemoryPaymentTermRepository([
      { id: 'payment-term-active', tenantId: 'tenant-1', name: '30/60', installmentsCount: 2, firstDueDays: 30, intervalDays: 30 },
      { id: 'payment-term-inactive', tenantId: 'tenant-1', name: 'Inativa', installmentsCount: 1, firstDueDays: 0, intervalDays: 0, status: 'inactive' },
    ]),
    customerRepresentedCommercialProfileRepository: new InMemoryCustomerRepresentedCommercialProfileRepository(),
  };
}

describe('customer represented commercial profile flow', () => {
  it('gets empty represented profile and sets global/represented defaults', async () => {
    const repositories = deps();

    const empty = await getCustomerRepresentedCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1' });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.data).toMatchObject({ defaultPriceTableId: null, defaultPaymentTermId: null });

    const globalDefault = await updateCustomerRepresentedCommercialProfileUseCase(repositories, {
      actor: admin,
      customerId: 'customer-1',
      representedCompanyId: 'represented-1',
      payload: { default_price_table_id: 'price-table-global', default_payment_term_id: 'payment-term-active' },
    });
    expect(globalDefault.ok).toBe(true);
    if (globalDefault.ok) expect(globalDefault.data).toMatchObject({ defaultPriceTableId: 'price-table-global', defaultPaymentTermId: 'payment-term-active' });

    const representedDefault = await updateCustomerRepresentedCommercialProfileUseCase(repositories, {
      actor: admin,
      customerId: 'customer-1',
      representedCompanyId: 'represented-1',
      payload: { default_price_table_id: 'price-table-rep-1', default_payment_term_id: null },
    });
    expect(representedDefault.ok).toBe(true);
    if (representedDefault.ok) expect(representedDefault.data).toMatchObject({ defaultPriceTableId: 'price-table-rep-1', defaultPaymentTermId: null });

    const paymentOnly = await updateCustomerRepresentedCommercialProfileUseCase(repositories, {
      actor: admin,
      customerId: 'customer-1',
      representedCompanyId: 'represented-1',
      payload: { default_payment_term_id: 'payment-term-active' },
    });
    expect(paymentOnly.ok).toBe(true);
    if (paymentOnly.ok) expect(paymentOnly.data).toMatchObject({ defaultPriceTableId: 'price-table-rep-1', defaultPaymentTermId: 'payment-term-active' });
  });

  it('validates customer, represented, defaults, mismatched represented table, and role writes', async () => {
    const repositories = deps();

    const missingCustomer = await updateCustomerRepresentedCommercialProfileUseCase(repositories, { actor: admin, customerId: 'missing', representedCompanyId: 'represented-1', payload: { default_price_table_id: 'price-table-global' } });
    expect(missingCustomer.ok).toBe(false);
    if (!missingCustomer.ok) expect(missingCustomer.error.code).toBe(APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND);

    const inactiveRepresented = await updateCustomerRepresentedCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-inactive', payload: { default_price_table_id: 'price-table-global' } });
    expect(inactiveRepresented.ok).toBe(false);
    if (!inactiveRepresented.ok) expect(inactiveRepresented.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const inactiveTable = await updateCustomerRepresentedCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', payload: { default_price_table_id: 'price-table-inactive' } });
    expect(inactiveTable.ok).toBe(false);
    if (!inactiveTable.ok) expect(inactiveTable.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const mismatchedTable = await updateCustomerRepresentedCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', payload: { default_price_table_id: 'price-table-rep-2' } });
    expect(mismatchedTable.ok).toBe(false);
    if (!mismatchedTable.ok) expect(mismatchedTable.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const inactivePaymentTerm = await updateCustomerRepresentedCommercialProfileUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', payload: { default_payment_term_id: 'payment-term-inactive' } });
    expect(inactivePaymentTerm.ok).toBe(false);
    if (!inactivePaymentTerm.ok) expect(inactivePaymentTerm.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const representativeWrite = await updateCustomerRepresentedCommercialProfileUseCase(repositories, { actor: representative, customerId: 'customer-1', representedCompanyId: 'represented-1', payload: { default_price_table_id: 'price-table-global' } });
    expect(representativeWrite.ok).toBe(false);
    if (!representativeWrite.ok) expect(representativeWrite.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);

    const representativeHiddenRead = await getCustomerRepresentedCommercialProfileUseCase(repositories, { actor: representative, customerId: 'customer-2', representedCompanyId: 'represented-1' });
    expect(representativeHiddenRead.ok).toBe(false);
    if (!representativeHiddenRead.ok) expect(representativeHiddenRead.error.code).toBe(APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND);
  });
});
