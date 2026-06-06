import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ERROR_CODES,
  InMemoryCustomerAddressRepository,
  InMemoryCustomerContactRepository,
  InMemoryCustomerRepository,
  createCustomerAddressUseCase,
  createCustomerContactUseCase,
  createCustomerUseCase,
  getCustomerUseCase,
  listCustomerAddressesUseCase,
  listCustomerContactsUseCase,
  listCustomersUseCase,
  updateCustomerAddressUseCase,
  updateCustomerContactUseCase,
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

  it('creates, lists and patches customer contacts with parent ownership guard', async () => {
    const customerRepository = new InMemoryCustomerRepository([
      { id: 'customer-owner-1', tenantId: 'tenant-1', status: 'active', legalName: 'Owner 1', documentType: 'cnpj', documentNumber: 'C1', ownerId: 'rep-1', representativeId: 'rep-1' },
      { id: 'customer-owner-2', tenantId: 'tenant-1', status: 'active', legalName: 'Owner 2', documentType: 'cnpj', documentNumber: 'C2', ownerId: 'rep-2', representativeId: 'rep-2' },
    ]);
    const customerContactRepository = new InMemoryCustomerContactRepository();
    const admin = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };
    const rep1 = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

    const created = await createCustomerContactUseCase(
      { customerRepository, customerContactRepository },
      { actor: admin, customerId: 'customer-owner-1', payload: { id: 'contact-1', name: 'Contato 1', email: 'c1@example.com', is_primary: true } }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.status).toBe('active');
    expect(created.data.isPrimary).toBe(true);

    const list = await listCustomerContactsUseCase({ customerRepository, customerContactRepository }, { actor: admin, customerId: 'customer-owner-1' });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.items).toHaveLength(1);

    const secondPrimary = await createCustomerContactUseCase(
      { customerRepository, customerContactRepository },
      { actor: admin, customerId: 'customer-owner-1', payload: { id: 'contact-2', name: 'Contato 2', is_primary: true } }
    );
    expect(secondPrimary.ok).toBe(true);
    const contactsAfterPrimary = await listCustomerContactsUseCase({ customerRepository, customerContactRepository }, { actor: admin, customerId: 'customer-owner-1' });
    expect(contactsAfterPrimary.ok).toBe(true);
    if (contactsAfterPrimary.ok) {
      expect(contactsAfterPrimary.data.items.find((item) => item.id === 'contact-2')?.isPrimary).toBe(true);
      expect(contactsAfterPrimary.data.items.find((item) => item.id === 'contact-1')?.isPrimary).toBe(false);
    }

    const patched = await updateCustomerContactUseCase(
      { customerRepository, customerContactRepository },
      { actor: admin, customerId: 'customer-owner-1', contactId: 'contact-1', payload: { phone: '11999999999' } }
    );
    expect(patched.ok).toBe(true);
    if (patched.ok) {
      expect(patched.data.name).toBe('Contato 1');
      expect(patched.data.email).toBe('c1@example.com');
      expect(patched.data.phone).toBe('11999999999');
    }

    const forbidden = await listCustomerContactsUseCase({ customerRepository, customerContactRepository }, { actor: rep1, customerId: 'customer-owner-2' });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);

    const wrongCustomer = await updateCustomerContactUseCase(
      { customerRepository, customerContactRepository },
      { actor: admin, customerId: 'customer-owner-2', contactId: 'contact-1', payload: { name: 'Wrong' } }
    );
    expect(wrongCustomer.ok).toBe(false);
    if (!wrongCustomer.ok) expect(wrongCustomer.error.code).toBe(APPLICATION_ERROR_CODES.CUSTOMER_CONTACT_NOT_FOUND);

    const invalid = await createCustomerContactUseCase({ customerRepository, customerContactRepository }, { actor: admin, customerId: 'customer-owner-1', payload: { email: 'missing-name@example.com' } });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const outOfScope = await createCustomerContactUseCase({ customerRepository, customerContactRepository }, { actor: admin, customerId: 'customer-owner-1', payload: { name: 'Contato', tenant_id: 'tenant-2' } });
    expect(outOfScope.ok).toBe(false);
    if (!outOfScope.ok) expect(outOfScope.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
  });

  it('creates, lists and patches customer addresses with parent ownership guard', async () => {
    const customerRepository = new InMemoryCustomerRepository([
      { id: 'customer-owner-1', tenantId: 'tenant-1', status: 'active', legalName: 'Owner 1', documentType: 'cnpj', documentNumber: 'A1', ownerId: 'rep-1', representativeId: 'rep-1' },
      { id: 'customer-owner-2', tenantId: 'tenant-1', status: 'active', legalName: 'Owner 2', documentType: 'cnpj', documentNumber: 'A2', ownerId: 'rep-2', representativeId: 'rep-2' },
    ]);
    const customerAddressRepository = new InMemoryCustomerAddressRepository();
    const admin = { role: 'ADMIN' as const, actorId: 'admin-1', actorTenantId: 'tenant-1' };
    const rep1 = { role: 'REPRESENTANTE' as const, actorId: 'rep-1', actorTenantId: 'tenant-1' };

    const created = await createCustomerAddressUseCase(
      { customerRepository, customerAddressRepository },
      { actor: admin, customerId: 'customer-owner-1', payload: { id: 'address-1', street: 'Rua 1', city: 'São Paulo', state: 'SP', is_primary: true } }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.country).toBe('BR');
    expect(created.data.status).toBe('active');

    const list = await listCustomerAddressesUseCase({ customerRepository, customerAddressRepository }, { actor: admin, customerId: 'customer-owner-1' });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.items).toHaveLength(1);

    const secondPrimary = await createCustomerAddressUseCase(
      { customerRepository, customerAddressRepository },
      { actor: admin, customerId: 'customer-owner-1', payload: { id: 'address-2', street: 'Rua 2', city: 'São Paulo', state: 'SP', is_primary: true } }
    );
    expect(secondPrimary.ok).toBe(true);
    const addressesAfterPrimary = await listCustomerAddressesUseCase({ customerRepository, customerAddressRepository }, { actor: admin, customerId: 'customer-owner-1' });
    expect(addressesAfterPrimary.ok).toBe(true);
    if (addressesAfterPrimary.ok) {
      expect(addressesAfterPrimary.data.items.find((item) => item.id === 'address-2')?.isPrimary).toBe(true);
      expect(addressesAfterPrimary.data.items.find((item) => item.id === 'address-1')?.isPrimary).toBe(false);
    }

    const patched = await updateCustomerAddressUseCase(
      { customerRepository, customerAddressRepository },
      { actor: admin, customerId: 'customer-owner-1', addressId: 'address-1', payload: { number: '100' } }
    );
    expect(patched.ok).toBe(true);
    if (patched.ok) {
      expect(patched.data.street).toBe('Rua 1');
      expect(patched.data.city).toBe('São Paulo');
      expect(patched.data.number).toBe('100');
    }

    const forbidden = await listCustomerAddressesUseCase({ customerRepository, customerAddressRepository }, { actor: rep1, customerId: 'customer-owner-2' });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe(APPLICATION_ERROR_CODES.FORBIDDEN);

    const wrongCustomer = await updateCustomerAddressUseCase(
      { customerRepository, customerAddressRepository },
      { actor: admin, customerId: 'customer-owner-2', addressId: 'address-1', payload: { street: 'Wrong' } }
    );
    expect(wrongCustomer.ok).toBe(false);
    if (!wrongCustomer.ok) expect(wrongCustomer.error.code).toBe(APPLICATION_ERROR_CODES.CUSTOMER_ADDRESS_NOT_FOUND);

    const invalid = await createCustomerAddressUseCase({ customerRepository, customerAddressRepository }, { actor: admin, customerId: 'customer-owner-1', payload: { street: 'Rua sem cidade' } });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);

    const outOfScope = await createCustomerAddressUseCase({ customerRepository, customerAddressRepository }, { actor: admin, customerId: 'customer-owner-1', payload: { street: 'Rua 2', city: 'SP', state: 'SP', commercial_profile: {} } });
    expect(outOfScope.ok).toBe(false);
    if (!outOfScope.ok) expect(outOfScope.error.code).toBe(APPLICATION_ERROR_CODES.VALIDATION_ERROR);
  });
});
