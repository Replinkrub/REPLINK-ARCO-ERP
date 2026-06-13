import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryCustomerProductPriceOverrideRepository,
  InMemoryCustomerRepository,
  InMemoryCustomerRepresentedCommercialProfileRepository,
  InMemoryPriceTableItemRepository,
  InMemoryPriceTableRepository,
  InMemoryProductRepository,
  InMemoryRepresentedCompanyRepository,
  createCustomerProductPriceOverrideUseCase,
  getCustomerProductPriceOverrideUseCase,
  listCustomerProductPriceOverridesUseCase,
  resolvePriceUseCase,
  updateCustomerProductPriceOverrideUseCase,
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
    ]),
    productRepository: new InMemoryProductRepository([
      { id: 'product-1', tenantId: 'tenant-1', representedCompanyId: 'represented-1', sku: 'P1', name: 'Produto 1' },
      { id: 'product-2', tenantId: 'tenant-1', representedCompanyId: 'represented-1', sku: 'P2', name: 'Produto 2' },
      { id: 'product-other-rep', tenantId: 'tenant-1', representedCompanyId: 'represented-2', sku: 'P3', name: 'Produto Outra Rep' },
    ]),
    priceTableRepository: new InMemoryPriceTableRepository([
      { id: 'price-table-1', tenantId: 'tenant-1', representedCompanyId: 'represented-1', name: 'Tabela 1', validFrom: '2026-01-01' },
    ]),
    priceTableItemRepository: new InMemoryPriceTableItemRepository([
      { id: 'price-table-item-1', tenantId: 'tenant-1', priceTableId: 'price-table-1', productId: 'product-1', unitPrice: 100, validFrom: '2026-01-01' },
    ]),
    customerRepresentedCommercialProfileRepository: new InMemoryCustomerRepresentedCommercialProfileRepository([
      { tenantId: 'tenant-1', customerId: 'customer-1', representedCompanyId: 'represented-1', defaultPriceTableId: 'price-table-1' },
    ]),
    customerProductPriceOverrideRepository: new InMemoryCustomerProductPriceOverrideRepository(),
  };
}

describe('customer product price overrides and price resolution', () => {
  it('creates, lists, reads, updates and deactivates customer product overrides', async () => {
    const repositories = deps();

    const created = await createCustomerProductPriceOverrideUseCase(repositories, {
      actor: admin,
      customerId: 'customer-1',
      representedCompanyId: 'represented-1',
      payload: { id: 'override-1', product_id: 'product-1', unit_price: 90, valid_from: '2026-01-01' },
    });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.data).toMatchObject({ id: 'override-1', unitPrice: 90, status: 'active' });

    const list = await listCustomerProductPriceOverridesUseCase(repositories, { actor: representative, customerId: 'customer-1', representedCompanyId: 'represented-1' });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.total).toBe(1);

    const get = await getCustomerProductPriceOverrideUseCase(repositories, { actor: representative, customerId: 'customer-1', representedCompanyId: 'represented-1', overrideId: 'override-1' });
    expect(get.ok).toBe(true);
    if (get.ok) expect(get.data.productId).toBe('product-1');

    const patched = await updateCustomerProductPriceOverrideUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', overrideId: 'override-1', payload: { unit_price: 88, status: 'inactive' } });
    expect(patched.ok).toBe(true);
    if (patched.ok) expect(patched.data).toMatchObject({ unitPrice: 88, status: 'inactive' });
  });

  it('enforces validation, represented safety, role writes and only one active override per logical key', async () => {
    const repositories = deps();

    const representativeCreate = await createCustomerProductPriceOverrideUseCase(repositories, { actor: representative, customerId: 'customer-1', representedCompanyId: 'represented-1', payload: { product_id: 'product-1', unit_price: 90, valid_from: '2026-01-01' } });
    expect(representativeCreate.ok).toBe(false);
    if (!representativeCreate.ok) expect(representativeCreate.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);

    const invalidPrice = await createCustomerProductPriceOverrideUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', payload: { product_id: 'product-1', unit_price: 0, valid_from: '2026-01-01' } });
    expect(invalidPrice.ok).toBe(false);
    if (!invalidPrice.ok) expect(invalidPrice.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const mismatchedProduct = await createCustomerProductPriceOverrideUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', payload: { product_id: 'product-other-rep', unit_price: 90, valid_from: '2026-01-01' } });
    expect(mismatchedProduct.ok).toBe(false);
    if (!mismatchedProduct.ok) expect(mismatchedProduct.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const first = await createCustomerProductPriceOverrideUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', payload: { id: 'override-active-1', product_id: 'product-1', unit_price: 90, valid_from: '2026-01-01' } });
    expect(first.ok).toBe(true);

    const duplicate = await createCustomerProductPriceOverrideUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', payload: { id: 'override-active-2', product_id: 'product-1', unit_price: 91, valid_from: '2026-02-01' } });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe(APPLICATION_ERROR_CODES.DUPLICATE_ACTIVE_CUSTOMER_PRODUCT_PRICE_OVERRIDE);
  });

  it('resolves override first, falls back to default table, and errors when price is not resolvable', async () => {
    const repositories = deps();

    const fallback = await resolvePriceUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', productId: 'product-1', onDate: '2026-06-01' });
    expect(fallback.ok).toBe(true);
    if (fallback.ok) expect(fallback.data).toMatchObject({ unitPrice: 100, source: 'PRICE_TABLE_ITEM', sourceId: 'price-table-item-1' });

    await createCustomerProductPriceOverrideUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', payload: { id: 'override-resolution-1', product_id: 'product-1', unit_price: 80, valid_from: '2026-01-01' } });
    const override = await resolvePriceUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', productId: 'product-1', onDate: '2026-06-01' });
    expect(override.ok).toBe(true);
    if (override.ok) expect(override.data).toMatchObject({ unitPrice: 80, source: 'CUSTOMER_PRODUCT_OVERRIDE', sourceId: 'override-resolution-1' });

    const unresolved = await resolvePriceUseCase(repositories, { actor: admin, customerId: 'customer-1', representedCompanyId: 'represented-1', productId: 'product-2', onDate: '2026-06-01' });
    expect(unresolved.ok).toBe(false);
    if (!unresolved.ok) expect(unresolved.error.code).toBe(APPLICATION_ERROR_CODES.PRICE_NOT_RESOLVABLE);
  });
});
