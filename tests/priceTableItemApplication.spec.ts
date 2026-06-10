import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryPriceTableItemRepository,
  InMemoryPriceTableRepository,
  InMemoryProductRepository,
  createPriceTableItemUseCase,
  getPriceTableItemUseCase,
  listPriceTableItemsUseCase,
  updatePriceTableItemUseCase,
} from '../src/index.js';

const admin = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };
const representative = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

function deps() {
  return {
    priceTableRepository: new InMemoryPriceTableRepository([
      { id: 'table-global', tenantId: 'tenant-1', name: 'Global', validFrom: '2026-01-01', validUntil: '2026-12-31' },
      { id: 'table-rep', tenantId: 'tenant-1', representedCompanyId: 'represented-1', name: 'Rep', validFrom: '2026-01-01' },
      { id: 'table-inactive', tenantId: 'tenant-1', name: 'Inactive', validFrom: '2026-01-01', status: 'inactive' },
    ]),
    productRepository: new InMemoryProductRepository([
      { id: 'product-global', tenantId: 'tenant-1', sku: 'GLOBAL', name: 'Global' },
      { id: 'product-rep', tenantId: 'tenant-1', representedCompanyId: 'represented-1', sku: 'REP', name: 'Rep' },
      { id: 'product-other-rep', tenantId: 'tenant-1', representedCompanyId: 'represented-2', sku: 'OTHER', name: 'Other' },
      { id: 'product-inactive', tenantId: 'tenant-1', sku: 'INACTIVE', name: 'Inactive', status: 'inactive' },
    ]),
    priceTableItemRepository: new InMemoryPriceTableItemRepository(),
  };
}

describe('price table item application flow', () => {
  it('creates, lists, gets and updates price table items', async () => {
    const repositories = deps();

    const created = await createPriceTableItemUseCase(repositories, {
      actor: admin,
      priceTableId: 'table-global',
      payload: { id: 'item-1', product_id: 'product-global', unit_price: 10.25, valid_from: '2026-01-01', valid_until: '2026-06-30' },
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data).toMatchObject({ status: 'active', unitPrice: 10.25, priceTableId: 'table-global', productId: 'product-global' });

    const list = await listPriceTableItemsUseCase(repositories, { actor: representative, priceTableId: 'table-global' });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.items).toHaveLength(1);

    const fetched = await getPriceTableItemUseCase(repositories, { actor: representative, priceTableId: 'table-global', itemId: 'item-1' });
    expect(fetched.ok).toBe(true);

    const updated = await updatePriceTableItemUseCase(repositories, {
      actor: admin,
      priceTableId: 'table-global',
      itemId: 'item-1',
      payload: { unit_price: 11.5, status: 'inactive' },
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data).toMatchObject({ unitPrice: 11.5, status: 'inactive' });
  });

  it('validates required fields, active dependencies and role writes', async () => {
    const repositories = deps();

    const missingProduct = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { unit_price: 10, valid_from: '2026-01-01' } });
    expect(missingProduct.ok).toBe(false);
    if (!missingProduct.ok) expect(missingProduct.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const invalidPrice = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { product_id: 'product-global', unit_price: 0, valid_from: '2026-01-01' } });
    expect(invalidPrice.ok).toBe(false);

    const inactiveTable = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-inactive', payload: { product_id: 'product-global', unit_price: 10, valid_from: '2026-01-01' } });
    expect(inactiveTable.ok).toBe(false);

    const inactiveProduct = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { product_id: 'product-inactive', unit_price: 10, valid_from: '2026-01-01' } });
    expect(inactiveProduct.ok).toBe(false);

    const representativeCreate = await createPriceTableItemUseCase(repositories, { actor: representative, priceTableId: 'table-global', payload: { product_id: 'product-global', unit_price: 10, valid_from: '2026-01-01' } });
    expect(representativeCreate.ok).toBe(false);
    if (!representativeCreate.ok) expect(representativeCreate.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);

    const outOfScope = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { product_id: 'product-global', unit_price: 10, valid_from: '2026-01-01', valid_until: '2026-01-31', override_price: 9 } });
    expect(outOfScope.ok).toBe(false);
    if (!outOfScope.ok) {
      expect(outOfScope.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
      expect(outOfScope.error.details?.field).toBe('override_price');
    }

    const missingTable = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'missing-table', payload: { product_id: 'product-global', unit_price: 10, valid_from: '2026-01-01' } });
    expect(missingTable.ok).toBe(false);
    if (!missingTable.ok) expect(missingTable.error.code).toBe(APPLICATION_ERROR_CODES.PRICE_TABLE_NOT_FOUND);

    const productNotFound = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { product_id: 'missing-product', unit_price: 10, valid_from: '2026-01-01', valid_until: '2026-01-31' } });
    expect(productNotFound.ok).toBe(false);
    if (!productNotFound.ok) expect(productNotFound.error.code).toBe(APPLICATION_ERROR_CODES.PRODUCT_NOT_FOUND);
  });

  it('blocks represented company mismatch and item validity outside table validity', async () => {
    const repositories = deps();

    const mismatch = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { product_id: 'product-rep', unit_price: 10, valid_from: '2026-01-01' } });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const mismatchOther = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-rep', payload: { product_id: 'product-other-rep', unit_price: 10, valid_from: '2026-01-01' } });
    expect(mismatchOther.ok).toBe(false);

    const missingItemEnd = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { product_id: 'product-global', unit_price: 10, valid_from: '2026-01-01' } });
    expect(missingItemEnd.ok).toBe(false);

    const beyondTableEnd = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { product_id: 'product-global', unit_price: 10, valid_from: '2026-01-01', valid_until: '2027-01-01' } });
    expect(beyondTableEnd.ok).toBe(false);
  });

  it('blocks overlapping active periods for the same table and product', async () => {
    const repositories = deps();
    const first = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-rep', payload: { id: 'item-1', product_id: 'product-rep', unit_price: 10, valid_from: '2026-01-01', valid_until: '2026-06-30' } });
    expect(first.ok).toBe(true);

    const overlap = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-rep', payload: { id: 'item-2', product_id: 'product-rep', unit_price: 11, valid_from: '2026-06-01', valid_until: '2026-12-31' } });
    expect(overlap.ok).toBe(false);
    if (!overlap.ok) expect(overlap.error.code).toBe(APPLICATION_ERROR_CODES.DUPLICATE_PRICE_TABLE_ITEM_PERIOD);

    const adjacent = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-rep', payload: { id: 'item-3', product_id: 'product-rep', unit_price: 12, valid_from: '2026-07-01', valid_until: '2026-12-31' } });
    expect(adjacent.ok).toBe(true);
  });

  it('uses inclusive validity boundaries for overlap checks', async () => {
    const repositories = deps();
    const first = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { id: 'boundary-1', product_id: 'product-global', unit_price: 10, valid_from: '2026-01-01', valid_until: '2026-01-31' } });
    expect(first.ok).toBe(true);

    const sameDayBoundary = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { id: 'boundary-2', product_id: 'product-global', unit_price: 11, valid_from: '2026-01-31', valid_until: '2026-02-28' } });
    expect(sameDayBoundary.ok).toBe(false);
    if (!sameDayBoundary.ok) expect(sameDayBoundary.error.code).toBe(APPLICATION_ERROR_CODES.DUPLICATE_PRICE_TABLE_ITEM_PERIOD);

    const nextDayBoundary = await createPriceTableItemUseCase(repositories, { actor: admin, priceTableId: 'table-global', payload: { id: 'boundary-3', product_id: 'product-global', unit_price: 12, valid_from: '2026-02-01', valid_until: '2026-02-28' } });
    expect(nextDayBoundary.ok).toBe(true);
  });
});
