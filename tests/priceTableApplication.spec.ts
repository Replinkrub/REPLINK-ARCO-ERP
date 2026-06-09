import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryPriceTableRepository,
  createPriceTableUseCase,
  getPriceTableUseCase,
  listPriceTablesUseCase,
  updatePriceTableUseCase,
} from '../src/index.js';

describe('price table application flow', () => {
  it('creates, lists, gets and updates price table core records', async () => {
    const repository = new InMemoryPriceTableRepository();
    const actor = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };

    const created = await createPriceTableUseCase(
      { priceTableRepository: repository },
      {
        actor,
        payload: {
          id: 'price-table-app-1',
          represented_company_id: 'represented-1',
          name: 'Tabela App',
          valid_from: '2026-01-01',
        },
        now: new Date('2026-01-01T00:00:00.000Z'),
      }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data).toMatchObject({ status: 'active', currency: 'BRL', representedCompanyId: 'represented-1' });

    const list = await listPriceTablesUseCase({ priceTableRepository: repository }, { actor, q: 'Tabela' });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.items).toHaveLength(1);

    const fetched = await getPriceTableUseCase({ priceTableRepository: repository }, { actor, priceTableId: 'price-table-app-1' });
    expect(fetched.ok).toBe(true);

    const updated = await updatePriceTableUseCase(
      { priceTableRepository: repository },
      { actor, priceTableId: 'price-table-app-1', payload: { name: 'Tabela App 2', status: 'inactive', valid_until: '2026-12-31' } }
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data).toMatchObject({ name: 'Tabela App 2', status: 'inactive', validUntil: '2026-12-31' });
  });

  it('validates required fields, dates, duplicate name scope and role writes', async () => {
    const repository = new InMemoryPriceTableRepository([
      { id: 'price-table-1', tenantId: 'tenant-1', name: 'DUP', validFrom: '2026-01-01' },
      { id: 'price-table-2', tenantId: 'tenant-1', representedCompanyId: 'represented-1', name: 'DUP', validFrom: '2026-01-01' },
      { id: 'price-table-3', tenantId: 'tenant-1', representedCompanyId: 'represented-2', name: 'DUP', validFrom: '2026-01-01' },
    ]);
    const admin = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };
    const representative = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

    const invalid = await createPriceTableUseCase({ priceTableRepository: repository }, { actor: admin, payload: { name: 'Sem data' } });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const invalidDate = await createPriceTableUseCase(
      { priceTableRepository: repository },
      { actor: admin, payload: { name: 'Data inválida', valid_from: '2026-02-01', valid_until: '2026-01-01' } }
    );
    expect(invalidDate.ok).toBe(false);
    if (!invalidDate.ok) expect(invalidDate.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const outOfScopeItem = await createPriceTableUseCase(
      { priceTableRepository: repository },
      { actor: admin, payload: { id: 'price-table-item', name: 'Itens fora', valid_from: '2026-01-01', price_table_items: [] } }
    );
    expect(outOfScopeItem.ok).toBe(false);
    if (!outOfScopeItem.ok) expect(outOfScopeItem.error.details?.field).toBe('price_table_items');

    const duplicateWithoutRepresented = await createPriceTableUseCase(
      { priceTableRepository: repository },
      { actor: admin, payload: { id: 'price-table-dup-1', name: 'DUP', valid_from: '2026-01-01' } }
    );
    expect(duplicateWithoutRepresented.ok).toBe(false);
    if (!duplicateWithoutRepresented.ok) expect(duplicateWithoutRepresented.error.code).toBe(APPLICATION_ERROR_CODES.DUPLICATE_PRICE_TABLE);

    const duplicateWithRepresented = await createPriceTableUseCase(
      { priceTableRepository: repository },
      { actor: admin, payload: { id: 'price-table-dup-2', represented_company_id: 'represented-1', name: 'DUP', valid_from: '2026-01-01' } }
    );
    expect(duplicateWithRepresented.ok).toBe(false);
    if (!duplicateWithRepresented.ok) expect(duplicateWithRepresented.error.code).toBe(APPLICATION_ERROR_CODES.DUPLICATE_PRICE_TABLE);

    const allowedDifferentRepresented = await createPriceTableUseCase(
      { priceTableRepository: repository },
      { actor: admin, payload: { id: 'price-table-allowed', represented_company_id: 'represented-3', name: 'DUP', valid_from: '2026-01-01' } }
    );
    expect(allowedDifferentRepresented.ok).toBe(true);

    const representativeCreate = await createPriceTableUseCase(
      { priceTableRepository: repository },
      { actor: representative, payload: { id: 'price-table-rep', name: 'Rep', valid_from: '2026-01-01' } }
    );
    expect(representativeCreate.ok).toBe(false);
    if (!representativeCreate.ok) expect(representativeCreate.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
  });

  it('allows representative reads within tenant and hides cross-tenant records', async () => {
    const repository = new InMemoryPriceTableRepository([
      { id: 'price-table-tenant-1', tenantId: 'tenant-1', name: 'Tabela T1', validFrom: '2026-01-01' },
      { id: 'price-table-tenant-2', tenantId: 'tenant-2', name: 'Tabela T2', validFrom: '2026-01-01' },
    ]);
    const representative = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

    const list = await listPriceTablesUseCase({ priceTableRepository: repository }, { actor: representative });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.items.map((item) => item.id)).toEqual(['price-table-tenant-1']);

    const hidden = await getPriceTableUseCase({ priceTableRepository: repository }, { actor: representative, priceTableId: 'price-table-tenant-2' });
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.error.code).toBe(APPLICATION_ERROR_CODES.PRICE_TABLE_NOT_FOUND);
  });
});
