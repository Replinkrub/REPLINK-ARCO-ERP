import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryCustomerRepository,
  createCustomerUseCase,
  getCustomerUseCase,
  listCustomersUseCase,
  updateCustomerUseCase,
} from '../src/index.js';

describe('customer application flow', () => {
  it('creates, lists, gets and updates customer core records', async () => {
    const repository = new InMemoryCustomerRepository();
    const actor = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };

    const created = await createCustomerUseCase(
      { customerRepository: repository },
      {
        actor,
        payload: { id: 'customer-app-1', legal_name: 'Cliente App', document_type: 'cnpj', document_number: 'APP-1' },
        now: new Date('2026-01-01T00:00:00.000Z'),
      }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.status).toBe('active');

    const list = await listCustomersUseCase({ customerRepository: repository }, { actor });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.items).toHaveLength(1);

    const fetched = await getCustomerUseCase({ customerRepository: repository }, { actor, customerId: 'customer-app-1' });
    expect(fetched.ok).toBe(true);

    const updated = await updateCustomerUseCase(
      { customerRepository: repository },
      { actor, customerId: 'customer-app-1', payload: { legal_name: 'Cliente App 2', status: 'inactive' } }
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data.status).toBe('inactive');
  });

  it('validates required fields, invalid status, duplicate document and ownership', async () => {
    const repository = new InMemoryCustomerRepository([
      { id: 'customer-owner-1', tenantId: 'tenant-1', status: 'active', legalName: 'Owner 1', documentType: 'cnpj', documentNumber: 'DUP', ownerId: 'rep-1', representativeId: 'rep-1' },
      { id: 'customer-owner-2', tenantId: 'tenant-1', status: 'active', legalName: 'Owner 2', documentType: 'cnpj', documentNumber: 'DUP-2', ownerId: 'rep-2', representativeId: 'rep-2' },
    ]);
    const admin = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };
    const rep1 = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

    const invalid = await createCustomerUseCase({ customerRepository: repository }, { actor: admin, payload: { legal_name: 'x' } });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const invalidStatus = await updateCustomerUseCase({ customerRepository: repository }, { actor: admin, customerId: 'customer-owner-1', payload: { status: 'blocked' } });
    expect(invalidStatus.ok).toBe(false);
    if (!invalidStatus.ok) expect(invalidStatus.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const duplicate = await createCustomerUseCase(
      { customerRepository: repository },
      { actor: admin, payload: { id: 'customer-dup', legal_name: 'Dup', document_type: 'cnpj', document_number: 'DUP' } }
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe(APPLICATION_ERROR_CODES.DUPLICATE_CUSTOMER_DOCUMENT);

    const hidden = await getCustomerUseCase({ customerRepository: repository }, { actor: rep1, customerId: 'customer-owner-2' });
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.error.code).toBe(APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND);

    const ownershipTransfer = await updateCustomerUseCase({ customerRepository: repository }, { actor: rep1, customerId: 'customer-owner-1', payload: { owner_id: 'rep-2' } });
    expect(ownershipTransfer.ok).toBe(false);
    if (!ownershipTransfer.ok) expect(ownershipTransfer.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);
  });

  it('rejects PR7A out-of-scope fields and preserves fields on partial update', async () => {
    const repository = new InMemoryCustomerRepository([
      { id: 'customer-partial', tenantId: 'tenant-1', status: 'active', legalName: 'Cliente Parcial', documentType: 'cnpj', documentNumber: 'PARTIAL-1', ownerId: 'admin-1', representativeId: 'admin-1' },
    ]);
    const admin = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };

    const createWithContacts = await createCustomerUseCase(
      { customerRepository: repository },
      { actor: admin, payload: { legal_name: 'Cliente', document_type: 'cnpj', document_number: 'OUT-1', contacts: [] } }
    );
    expect(createWithContacts.ok).toBe(false);
    if (!createWithContacts.ok) expect(createWithContacts.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const updateWithDefaultPayment = await updateCustomerUseCase(
      { customerRepository: repository },
      { actor: admin, customerId: 'customer-partial', payload: { default_payment_term_id: 'term-1' } }
    );
    expect(updateWithDefaultPayment.ok).toBe(false);
    if (!updateWithDefaultPayment.ok) expect(updateWithDefaultPayment.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const statusOnly = await updateCustomerUseCase(
      { customerRepository: repository },
      { actor: admin, customerId: 'customer-partial', payload: { status: 'inactive' } }
    );
    expect(statusOnly.ok).toBe(true);
    if (!statusOnly.ok) return;
    expect(statusOnly.data.legalName).toBe('Cliente Parcial');
    expect(statusOnly.data.documentNumber).toBe('PARTIAL-1');
    expect(statusOnly.data.status).toBe('inactive');
  });
});
