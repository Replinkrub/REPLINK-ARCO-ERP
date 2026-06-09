import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryProductRepository,
  createProductUseCase,
  getProductUseCase,
  listProductsUseCase,
  updateProductUseCase,
} from '../src/index.js';

describe('product application flow', () => {
  it('creates, lists, gets and updates product core records', async () => {
    const repository = new InMemoryProductRepository();
    const actor = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };

    const created = await createProductUseCase(
      { productRepository: repository },
      {
        actor,
        payload: {
          id: 'product-app-1',
          sku: 'SKU-1',
          name: 'Produto App',
          represented_company_id: 'represented-1',
          commercial_name: 'Produto',
          minimum_order_quantity: 1,
        },
        now: new Date('2026-01-01T00:00:00.000Z'),
      }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.status).toBe('active');
    expect(created.data.representedCompanyId).toBe('represented-1');

    const list = await listProductsUseCase({ productRepository: repository }, { actor, q: 'SKU' });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.items).toHaveLength(1);

    const fetched = await getProductUseCase({ productRepository: repository }, { actor, productId: 'product-app-1' });
    expect(fetched.ok).toBe(true);

    const updated = await updateProductUseCase(
      { productRepository: repository },
      { actor, productId: 'product-app-1', payload: { name: 'Produto App 2', status: 'inactive' } }
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.data.name).toBe('Produto App 2');
      expect(updated.data.sku).toBe('SKU-1');
      expect(updated.data.status).toBe('inactive');
    }
  });

  it('validates required fields, invalid status, duplicate SKU scope and role writes', async () => {
    const repository = new InMemoryProductRepository([
      { id: 'product-1', tenantId: 'tenant-1', sku: 'DUP', name: 'Produto 1' },
      { id: 'product-2', tenantId: 'tenant-1', representedCompanyId: 'represented-1', sku: 'DUP', name: 'Produto 2' },
      { id: 'product-3', tenantId: 'tenant-1', representedCompanyId: 'represented-2', sku: 'DUP', name: 'Produto 3' },
    ]);
    const admin = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };
    const representative = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

    const invalid = await createProductUseCase({ productRepository: repository }, { actor: admin, payload: { name: 'Sem SKU' } });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const invalidStatus = await updateProductUseCase({ productRepository: repository }, { actor: admin, productId: 'product-1', payload: { status: 'blocked' } });
    expect(invalidStatus.ok).toBe(false);
    if (!invalidStatus.ok) expect(invalidStatus.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const invalidQuantity = await updateProductUseCase({ productRepository: repository }, { actor: admin, productId: 'product-1', payload: { minimum_order_quantity: -1 } });
    expect(invalidQuantity.ok).toBe(false);
    if (!invalidQuantity.ok) expect(invalidQuantity.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const outOfScopePrice = await createProductUseCase(
      { productRepository: repository },
      { actor: admin, payload: { id: 'product-price', sku: 'PRICE', name: 'Preço fora', price_table_id: 'table-1' } }
    );
    expect(outOfScopePrice.ok).toBe(false);
    if (!outOfScopePrice.ok) {
      expect(outOfScopePrice.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
      expect(outOfScopePrice.error.details?.field).toBe('price_table_id');
    }

    const duplicateWithoutRepresented = await createProductUseCase(
      { productRepository: repository },
      { actor: admin, payload: { id: 'product-dup-1', sku: 'DUP', name: 'Dup' } }
    );
    expect(duplicateWithoutRepresented.ok).toBe(false);
    if (!duplicateWithoutRepresented.ok) expect(duplicateWithoutRepresented.error.code).toBe(APPLICATION_ERROR_CODES.DUPLICATE_PRODUCT_SKU);

    const duplicateWithRepresented = await createProductUseCase(
      { productRepository: repository },
      { actor: admin, payload: { id: 'product-dup-2', represented_company_id: 'represented-1', sku: 'DUP', name: 'Dup' } }
    );
    expect(duplicateWithRepresented.ok).toBe(false);
    if (!duplicateWithRepresented.ok) expect(duplicateWithRepresented.error.code).toBe(APPLICATION_ERROR_CODES.DUPLICATE_PRODUCT_SKU);

    const allowedDifferentRepresented = await createProductUseCase(
      { productRepository: repository },
      { actor: admin, payload: { id: 'product-allowed', represented_company_id: 'represented-3', sku: 'DUP', name: 'Dup allowed' } }
    );
    expect(allowedDifferentRepresented.ok).toBe(true);

    const representativeCreate = await createProductUseCase(
      { productRepository: repository },
      { actor: representative, payload: { id: 'product-rep', sku: 'REP', name: 'Rep' } }
    );
    expect(representativeCreate.ok).toBe(false);
    if (!representativeCreate.ok) expect(representativeCreate.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
  });

  it('allows representative reads within tenant and hides cross-tenant records', async () => {
    const repository = new InMemoryProductRepository([
      { id: 'product-tenant-1', tenantId: 'tenant-1', sku: 'T1', name: 'Produto T1' },
      { id: 'product-tenant-2', tenantId: 'tenant-2', sku: 'T2', name: 'Produto T2' },
    ]);
    const representative = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

    const list = await listProductsUseCase({ productRepository: repository }, { actor: representative });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.items.map((item) => item.id)).toEqual(['product-tenant-1']);

    const hidden = await getProductUseCase({ productRepository: repository }, { actor: representative, productId: 'product-tenant-2' });
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.error.code).toBe(APPLICATION_ERROR_CODES.PRODUCT_NOT_FOUND);
  });
});
