import { describe, expect, it } from 'vitest';
import { createMinimalHttpApi, InMemoryCustomerAddressRepository, InMemoryCustomerCommercialProfileRepository, InMemoryCustomerContactRepository, InMemoryCustomerRepository, InMemoryOrderRepository, InMemoryPriceTableItemRepository, InMemoryPriceTableRepository, InMemoryProductRepository, InMemoryQuoteRepository } from '../src/index.js';

const ORIGINAL_APP_TENANT_ID = process.env.APP_TENANT_ID;
const ORIGINAL_APP_REQUIRES_REPRESENTED_COMPANY = process.env.APP_REQUIRES_REPRESENTED_COMPANY;

async function withEnvironmentTenant<T>(
  tenantId: string,
  run: () => Promise<T> | T,
  requiresRepresentedCompany?: string
): Promise<T> {
  process.env.APP_TENANT_ID = tenantId;
  if (requiresRepresentedCompany === undefined) {
    delete process.env.APP_REQUIRES_REPRESENTED_COMPANY;
  } else {
    process.env.APP_REQUIRES_REPRESENTED_COMPANY = requiresRepresentedCompany;
  }
  try {
    return await run();
  } finally {
    if (ORIGINAL_APP_TENANT_ID === undefined) {
      delete process.env.APP_TENANT_ID;
    } else {
      process.env.APP_TENANT_ID = ORIGINAL_APP_TENANT_ID;
    }

    if (ORIGINAL_APP_REQUIRES_REPRESENTED_COMPANY === undefined) {
      delete process.env.APP_REQUIRES_REPRESENTED_COMPANY;
    } else {
      process.env.APP_REQUIRES_REPRESENTED_COMPANY = ORIGINAL_APP_REQUIRES_REPRESENTED_COMPANY;
    }
  }
}

function actorHeaders(overrides: Record<string, string> = {}) {
  return {
    'x-actor-role': 'ADMIN',
    'x-actor-id': 'admin-1',
    'content-type': 'application/json',
    ...overrides,
  };
}

function customerRepository(customers: Array<{
  id: string;
  tenantId?: string;
  status?: 'active' | 'inactive';
  legalName?: string;
  documentType?: string;
  documentNumber?: string;
  ownerId?: string;
  representativeId?: string;
}> = []) {
  return new InMemoryCustomerRepository(
    customers.map((customer) => ({
      id: customer.id,
      tenantId: customer.tenantId ?? 'tenant-env-1',
      status: customer.status ?? 'active',
      legalName: customer.legalName,
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      ownerId: customer.ownerId,
      representativeId: customer.representativeId,
    }))
  );
}

describe('minimal HTTP API', () => {
  it('supports Customer Commercial Profile default price table routes', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([{ id: 'customer-profile-api-1', ownerId: 'rep-1', representativeId: 'rep-1' }]),
        customerCommercialProfileRepository: new InMemoryCustomerCommercialProfileRepository(),
        priceTableRepository: new InMemoryPriceTableRepository([
          { id: 'price-table-profile-api-1', tenantId: 'tenant-env-1', name: 'Tabela Perfil', validFrom: '2026-01-01' },
          { id: 'price-table-profile-api-rep', tenantId: 'tenant-env-1', representedCompanyId: 'represented-1', name: 'Tabela Rep', validFrom: '2026-01-01' },
        ]),
      });

      const getEmpty = await api(new Request('http://localhost/v1/customers/customer-profile-api-1/commercial-profile', { headers: actorHeaders({ 'x-actor-role': 'REPRESENTANTE', 'x-actor-id': 'rep-1' }) }));
      expect(getEmpty.status).toBe(200);
      await expect(getEmpty.json()).resolves.toMatchObject({ customerId: 'customer-profile-api-1', defaultPriceTableId: null });

      const patchResponse = await api(new Request('http://localhost/v1/customers/customer-profile-api-1/commercial-profile', {
        method: 'PATCH',
        headers: actorHeaders(),
        body: JSON.stringify({ default_price_table_id: 'price-table-profile-api-1' }),
      }));
      expect(patchResponse.status).toBe(200);
      await expect(patchResponse.json()).resolves.toMatchObject({ defaultPriceTableId: 'price-table-profile-api-1' });

      const representedResponse = await api(new Request('http://localhost/v1/customers/customer-profile-api-1/commercial-profile', {
        method: 'PATCH',
        headers: actorHeaders(),
        body: JSON.stringify({ default_price_table_id: 'price-table-profile-api-rep' }),
      }));
      expect(representedResponse.status).toBe(422);

      const representativePatch = await api(new Request('http://localhost/v1/customers/customer-profile-api-1/commercial-profile', {
        method: 'PATCH',
        headers: actorHeaders({ 'x-actor-role': 'REPRESENTANTE', 'x-actor-id': 'rep-1' }),
        body: JSON.stringify({ default_price_table_id: null }),
      }));
      expect(representativePatch.status).toBe(403);
    });
  });

  it('supports Price Tables API core routes', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository(),
        priceTableRepository: new InMemoryPriceTableRepository(),
      });

      const createResponse = await api(new Request('http://localhost/v1/price-tables', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ id: 'price-table-api-1', name: 'Tabela API', valid_from: '2026-01-01' }),
      }));
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json() as { id: string; tenantId: string; status: string; currency: string };
      expect(created).toMatchObject({ id: 'price-table-api-1', tenantId: 'tenant-env-1', status: 'active', currency: 'BRL' });

      const listResponse = await api(new Request('http://localhost/v1/price-tables?q=Tabela', { headers: actorHeaders() }));
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json() as { items: Array<{ id: string }>; total: number };
      expect(list.total).toBe(1);
      expect(list.items[0]?.id).toBe('price-table-api-1');

      const getResponse = await api(new Request('http://localhost/v1/price-tables/price-table-api-1', { headers: actorHeaders() }));
      expect(getResponse.status).toBe(200);

      const patchResponse = await api(new Request('http://localhost/v1/price-tables/price-table-api-1', {
        method: 'PATCH',
        headers: actorHeaders(),
        body: JSON.stringify({ name: 'Tabela API Editada', status: 'inactive' }),
      }));
      expect(patchResponse.status).toBe(200);
      const patched = await patchResponse.json() as { name: string; status: string };
      expect(patched).toMatchObject({ name: 'Tabela API Editada', status: 'inactive' });
    });
  });

  it('supports Price Table Items API routes', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository(),
        priceTableRepository: new InMemoryPriceTableRepository([{ id: 'price-table-api-items', tenantId: 'tenant-env-1', name: 'Tabela Itens', validFrom: '2026-01-01', validUntil: '2026-12-31' }]),
        productRepository: new InMemoryProductRepository([{ id: 'product-api-items', tenantId: 'tenant-env-1', sku: 'ITEM', name: 'Produto Item' }]),
        priceTableItemRepository: new InMemoryPriceTableItemRepository(),
      });

      const createResponse = await api(new Request('http://localhost/v1/price-tables/price-table-api-items/items', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ id: 'item-api-1', product_id: 'product-api-items', unit_price: 10.5, valid_from: '2026-01-01', valid_until: '2026-06-30' }),
      }));
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json() as { id: string; unitPrice: number };
      expect(created).toMatchObject({ id: 'item-api-1', unitPrice: 10.5 });

      const listResponse = await api(new Request('http://localhost/v1/price-tables/price-table-api-items/items', { headers: actorHeaders({ 'x-actor-role': 'REPRESENTANTE', 'x-actor-id': 'rep-1' }) }));
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json() as { items: Array<{ id: string }>; total: number };
      expect(list.total).toBe(1);

      const getResponse = await api(new Request('http://localhost/v1/price-tables/price-table-api-items/items/item-api-1', { headers: actorHeaders() }));
      expect(getResponse.status).toBe(200);

      const patchResponse = await api(new Request('http://localhost/v1/price-tables/price-table-api-items/items/item-api-1', {
        method: 'PATCH',
        headers: actorHeaders(),
        body: JSON.stringify({ unit_price: 11.25, status: 'inactive' }),
      }));
      expect(patchResponse.status).toBe(200);
      const patched = await patchResponse.json() as { unitPrice: number; status: string };
      expect(patched).toMatchObject({ unitPrice: 11.25, status: 'inactive' });
    });
  });

  it('protects Price Tables API writes by role and rejects out-of-scope fields', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository(),
        priceTableRepository: new InMemoryPriceTableRepository(),
      });

      const representativeCreate = await api(new Request('http://localhost/v1/price-tables', {
        method: 'POST',
        headers: actorHeaders({ 'x-actor-role': 'REPRESENTANTE', 'x-actor-id': 'rep-1' }),
        body: JSON.stringify({ id: 'price-table-rep-api', name: 'Rep', valid_from: '2026-01-01' }),
      }));
      expect(representativeCreate.status).toBe(403);

      const outOfScope = await api(new Request('http://localhost/v1/price-tables', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ id: 'price-table-item-api', name: 'Item fora', valid_from: '2026-01-01', price_table_items: [] }),
      }));
      expect(outOfScope.status).toBe(422);
      await expect(outOfScope.json()).resolves.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  it('supports Products API foundation routes', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository(),
        productRepository: new InMemoryProductRepository(),
      });

      const createResponse = await api(new Request('http://localhost/v1/products', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ id: 'product-api-1', sku: 'SKU-API-1', name: 'Produto API' }),
      }));
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json() as { id: string; tenantId: string; status: string };
      expect(created).toMatchObject({ id: 'product-api-1', tenantId: 'tenant-env-1', status: 'active' });

      const listResponse = await api(new Request('http://localhost/v1/products?q=SKU-API', { headers: actorHeaders() }));
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json() as { items: Array<{ id: string }>; total: number };
      expect(list.total).toBe(1);
      expect(list.items[0]?.id).toBe('product-api-1');

      const getResponse = await api(new Request('http://localhost/v1/products/product-api-1', { headers: actorHeaders() }));
      expect(getResponse.status).toBe(200);

      const patchResponse = await api(new Request('http://localhost/v1/products/product-api-1', {
        method: 'PATCH',
        headers: actorHeaders(),
        body: JSON.stringify({ name: 'Produto API Editado', status: 'inactive' }),
      }));
      expect(patchResponse.status).toBe(200);
      const patched = await patchResponse.json() as { name: string; sku: string; status: string };
      expect(patched).toMatchObject({ name: 'Produto API Editado', sku: 'SKU-API-1', status: 'inactive' });
    });
  });

  it('protects Products API writes by role and tenant headers', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository(),
        productRepository: new InMemoryProductRepository(),
      });

      const representativeCreate = await api(new Request('http://localhost/v1/products', {
        method: 'POST',
        headers: actorHeaders({ 'x-actor-role': 'REPRESENTANTE', 'x-actor-id': 'rep-1' }),
        body: JSON.stringify({ id: 'product-rep-api', sku: 'REP', name: 'Rep' }),
      }));
      expect(representativeCreate.status).toBe(403);

      const tenantMismatch = await api(new Request('http://localhost/v1/products', {
        method: 'GET',
        headers: actorHeaders({ 'x-tenant-id': 'tenant-other' }),
      }));
      expect(tenantMismatch.status).toBe(403);
    });
  });

  it('supports Customer API Core create/list/get/patch', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository(),
      });

      const createResponse = await api(new Request('http://localhost/v1/customers', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({
          id: 'customer-api-1',
          legal_name: 'Cliente API',
          document_type: 'cnpj',
          document_number: '123',
        }),
      }));
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json() as { id: string; status: string; tenantId: string; ownerId: string };
      expect(created).toMatchObject({ id: 'customer-api-1', status: 'active', tenantId: 'tenant-env-1', ownerId: 'admin-1' });

      const listResponse = await api(new Request('http://localhost/v1/customers?q=Cliente', { headers: actorHeaders() }));
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json() as { items: Array<{ id: string }>; total: number };
      expect(list.total).toBe(1);
      expect(list.items[0]?.id).toBe('customer-api-1');

      const getResponse = await api(new Request('http://localhost/v1/customers/customer-api-1', { headers: actorHeaders() }));
      expect(getResponse.status).toBe(200);

      const patchResponse = await api(new Request('http://localhost/v1/customers/customer-api-1', {
        method: 'PATCH',
        headers: actorHeaders(),
        body: JSON.stringify({ legal_name: 'Cliente API Editado', status: 'inactive' }),
      }));
      expect(patchResponse.status).toBe(200);
      const patched = await patchResponse.json() as { legalName: string; status: string };
      expect(patched.legalName).toBe('Cliente API Editado');
      expect(patched.status).toBe('inactive');
    });
  });

  it('supports Customer Contacts + Addresses API foundation routes', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([{ id: 'customer-api-1', ownerId: 'admin-1', representativeId: 'admin-1' }]),
        customerContactRepository: new InMemoryCustomerContactRepository(),
        customerAddressRepository: new InMemoryCustomerAddressRepository(),
      });

      const createContact = await api(new Request('http://localhost/v1/customers/customer-api-1/contacts', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ id: 'contact-api-1', name: 'Contato API', email: 'contato@example.com' }),
      }));
      expect(createContact.status).toBe(201);

      const listContacts = await api(new Request('http://localhost/v1/customers/customer-api-1/contacts', { headers: actorHeaders() }));
      expect(listContacts.status).toBe(200);
      const contacts = await listContacts.json() as { items: Array<{ id: string }> };
      expect(contacts.items[0]?.id).toBe('contact-api-1');

      const patchContact = await api(new Request('http://localhost/v1/customers/customer-api-1/contacts/contact-api-1', {
        method: 'PATCH',
        headers: actorHeaders(),
        body: JSON.stringify({ phone: '11999999999' }),
      }));
      expect(patchContact.status).toBe(200);
      const patchedContact = await patchContact.json() as { name: string; phone: string };
      expect(patchedContact.name).toBe('Contato API');
      expect(patchedContact.phone).toBe('11999999999');

      const createAddress = await api(new Request('http://localhost/v1/customers/customer-api-1/addresses', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ id: 'address-api-1', street: 'Rua API', city: 'São Paulo', state: 'SP' }),
      }));
      expect(createAddress.status).toBe(201);

      const listAddresses = await api(new Request('http://localhost/v1/customers/customer-api-1/addresses', { headers: actorHeaders() }));
      expect(listAddresses.status).toBe(200);
      const addresses = await listAddresses.json() as { items: Array<{ id: string }> };
      expect(addresses.items[0]?.id).toBe('address-api-1');

      const patchAddress = await api(new Request('http://localhost/v1/customers/customer-api-1/addresses/address-api-1', {
        method: 'PATCH',
        headers: actorHeaders(),
        body: JSON.stringify({ number: '100' }),
      }));
      expect(patchAddress.status).toBe(200);
      const patchedAddress = await patchAddress.json() as { street: string; number: string };
      expect(patchedAddress.street).toBe('Rua API');
      expect(patchedAddress.number).toBe('100');
    });
  });

  it('protects Customer Contacts + Addresses API with actor and tenant guards', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([{ id: 'customer-api-1', ownerId: 'admin-1', representativeId: 'admin-1' }]),
        customerContactRepository: new InMemoryCustomerContactRepository(),
        customerAddressRepository: new InMemoryCustomerAddressRepository(),
      });

      const missingActor = await api(new Request('http://localhost/v1/customers/customer-api-1/contacts'));
      expect(missingActor.status).toBe(401);

      const tenantMismatch = await api(new Request('http://localhost/v1/customers/customer-api-1/addresses', {
        headers: actorHeaders({ 'x-tenant-id': 'tenant-other' }),
      }));
      expect(tenantMismatch.status).toBe(403);
    });
  });

  it('rejects invalid and duplicate customer API payloads deterministically', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository(),
      });

      const invalid = await api(new Request('http://localhost/v1/customers', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ legal_name: 'Cliente sem documento' }),
      }));
      expect(invalid.status).toBe(422);
      await expect(invalid.json()).resolves.toMatchObject({ code: 'VALIDATION_ERROR' });

      const first = await api(new Request('http://localhost/v1/customers', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ id: 'customer-dup-1', legal_name: 'Cliente 1', document_type: 'cnpj', document_number: 'DUP' }),
      }));
      expect(first.status).toBe(201);

      const duplicate = await api(new Request('http://localhost/v1/customers', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ id: 'customer-dup-2', legal_name: 'Cliente 2', document_type: 'cnpj', document_number: 'DUP' }),
      }));
      expect(duplicate.status).toBe(422);
      await expect(duplicate.json()).resolves.toMatchObject({ code: 'DUPLICATE_CUSTOMER_DOCUMENT' });

      const outOfScope = await api(new Request('http://localhost/v1/customers', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ legal_name: 'Cliente 3', document_type: 'cnpj', document_number: 'OUT', addresses: [] }),
      }));
      expect(outOfScope.status).toBe(422);
      await expect(outOfScope.json()).resolves.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  it('scopes Customer API Core by tenant and representative ownership', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([
          { id: 'customer-rep-1', legalName: 'Rep 1', documentType: 'cnpj', documentNumber: 'R1', ownerId: 'rep-1', representativeId: 'rep-1' },
          { id: 'customer-rep-2', legalName: 'Rep 2', documentType: 'cnpj', documentNumber: 'R2', ownerId: 'rep-2', representativeId: 'rep-2' },
        ]),
      });

      const repHeaders = actorHeaders({ 'x-actor-role': 'REPRESENTANTE', 'x-actor-id': 'rep-1' });
      const listResponse = await api(new Request('http://localhost/v1/customers', { headers: repHeaders }));
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json() as { items: Array<{ id: string }> };
      expect(list.items.map((item) => item.id)).toEqual(['customer-rep-1']);

      const deniedGet = await api(new Request('http://localhost/v1/customers/customer-rep-2', { headers: repHeaders }));
      expect(deniedGet.status).toBe(404);

      const tenantMismatch = await api(new Request('http://localhost/v1/customers', { headers: actorHeaders({ 'x-tenant-id': 'tenant-other' }) }));
      expect(tenantMismatch.status).toBe(403);
    });
  });

  it('creates quote and confirms into order using use cases', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const quoteRepository = new InMemoryQuoteRepository();
      const orderRepository = new InMemoryOrderRepository();
      const api = createMinimalHttpApi({
        quoteRepository,
        orderRepository,
        customerRepository: customerRepository([{ id: 'customer-1' }]),
      });

      const createResponse = await api(
        new Request('http://localhost/v0/quotes', {
          method: 'POST',
          headers: actorHeaders({ 'x-tenant-id': 'tenant-env-1' }),
          body: JSON.stringify({
            id: 'q-http-1',
            customerId: 'customer-1',
            ownerId: 'owner-1',
            representativeId: 'rep-1',
            numberSequence: 45,
          }),
        })
      );

      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as { tenantId: string };
      expect(created.tenantId).toBe('tenant-env-1');

      const confirmResponse = await api(
        new Request('http://localhost/v0/quotes/q-http-1/confirm', {
          method: 'POST',
          headers: actorHeaders({ 'x-tenant-id': 'tenant-env-1' }),
          body: JSON.stringify({ orderSequence: 99 }),
        })
      );

      expect(confirmResponse.status).toBe(200);
      const confirmed = (await confirmResponse.json()) as { status: string; source_quote_id: string; tenantId: string };
      expect(confirmed.status).toBe('ORDER_CONFIRMED');
      expect(confirmed.source_quote_id).toBe('q-http-1');
      expect(confirmed.tenantId).toBe('tenant-env-1');
    });
  });

  it('blocks tenant header mismatch against environment tenant', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository(),
      });

      const response = await api(new Request('http://localhost/v0/quotes', {
        method: 'POST',
        headers: actorHeaders({ 'x-tenant-id': 'tenant-other' }),
        body: JSON.stringify({ id: 'q-http-mismatch', customerId: 'customer-1', numberSequence: 1 }),
      }));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        code: 'TENANT_MISMATCH',
        message: 'Tenant header does not match environment tenant',
      });
    });
  });

  it('rejects missing, inactive, or cross-tenant customers when creating quote', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([
          { id: 'customer-inactive', status: 'inactive' },
          { id: 'customer-cross', tenantId: 'tenant-other' },
        ]),
      });

      for (const customerId of ['customer-missing', 'customer-inactive', 'customer-cross']) {
        const response = await api(new Request('http://localhost/v0/quotes', {
          method: 'POST',
          headers: actorHeaders(),
          body: JSON.stringify({ id: `q-http-${customerId}`, customerId, numberSequence: 1 }),
        }));

        expect(response.status).toBe(422);
        const error = await response.json() as { code: string; message: string };
        expect(error.code).toBe('CUSTOMER_NOT_AVAILABLE');
        expect(error.message).toBe('Cliente inválido ou indisponível');
      }
    });
  });

  it('accepts optional representedCompanyId without requiring it', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const quoteRepository = new InMemoryQuoteRepository();
      const orderRepository = new InMemoryOrderRepository();
      const api = createMinimalHttpApi({
        quoteRepository,
        orderRepository,
        customerRepository: customerRepository([{ id: 'customer-1' }]),
      });

      const createResponse = await api(new Request('http://localhost/v0/quotes', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({
          id: 'q-http-represented-1',
          representedCompanyId: 'represented-1',
          customerId: 'customer-1',
          numberSequence: 46,
        }),
      }));

      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as { representedCompanyId?: string };
      expect(created.representedCompanyId).toBe('represented-1');

      const confirmResponse = await api(new Request('http://localhost/v0/quotes/q-http-represented-1/confirm', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ orderSequence: 100 }),
      }));

      expect(confirmResponse.status).toBe(200);
      const confirmed = (await confirmResponse.json()) as { representedCompanyId?: string; sourceQuoteSnapshot?: { represented_company_id?: string } };
      expect(confirmed.representedCompanyId).toBe('represented-1');
      expect(confirmed.sourceQuoteSnapshot?.represented_company_id).toBe('represented-1');
    });
  });

  it('keeps representedCompanyId optional when enforcement config is disabled', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([{ id: 'customer-1' }]),
      });

      const response = await api(new Request('http://localhost/v0/quotes', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ id: 'q-http-represented-disabled', customerId: 'customer-1', numberSequence: 47 }),
      }));

      expect(response.status).toBe(201);
      const created = (await response.json()) as { representedCompanyId?: string };
      expect(created.representedCompanyId).toBeUndefined();
    }, 'false');
  });

  it('requires representedCompanyId when enforcement config is true', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([{ id: 'customer-1' }]),
      });

      const response = await api(new Request('http://localhost/v0/quotes', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({ id: 'q-http-represented-required', customerId: 'customer-1', numberSequence: 48 }),
      }));

      expect(response.status).toBe(422);
      const error = await response.json() as { code: string };
      expect(error.code).toBe('REQUIRED_REPRESENTED_COMPANY');
    }, 'true');
  });

  it('treats blank representedCompanyId as missing when enforcement config is true', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([{ id: 'customer-1' }]),
      });

      const response = await api(new Request('http://localhost/v0/quotes', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({
          id: 'q-http-represented-blank',
          representedCompanyId: ' ',
          customerId: 'customer-1',
          numberSequence: 49,
        }),
      }));

      expect(response.status).toBe(422);
      const error = await response.json() as { code: string };
      expect(error.code).toBe('REQUIRED_REPRESENTED_COMPANY');
    }, 'true');
  });

  it('creates quote with normalized representedCompanyId when enforcement config is true', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([{ id: 'customer-1' }]),
      });

      const response = await api(new Request('http://localhost/v0/quotes', {
        method: 'POST',
        headers: actorHeaders(),
        body: JSON.stringify({
          id: 'q-http-represented-normalized',
          representedCompanyId: ' represented-1 ',
          customerId: 'customer-1',
          numberSequence: 50,
        }),
      }));

      expect(response.status).toBe(201);
      const created = (await response.json()) as { representedCompanyId?: string };
      expect(created.representedCompanyId).toBe('represented-1');
    }, 'true');
  });

  it('does not allow missing actor headers', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const api = createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([{ id: 'customer-1' }]),
      });

      const response = await api(new Request('http://localhost/v0/quotes', { method: 'POST' }));
      expect(response.status).toBe(401);
    });
  });

  it('fails fast when APP_TENANT_ID is missing', () => {
    delete process.env.APP_TENANT_ID;
    try {
      expect(() => createMinimalHttpApi({
        quoteRepository: new InMemoryQuoteRepository(),
        orderRepository: new InMemoryOrderRepository(),
        customerRepository: customerRepository([{ id: 'customer-1' }]),
      })).toThrow('APP_TENANT_ID is required to resolve runtime tenant.');
    } finally {
      if (ORIGINAL_APP_TENANT_ID !== undefined) process.env.APP_TENANT_ID = ORIGINAL_APP_TENANT_ID;
    }
  });

  it('returns canonical 503 when database dependency is unavailable', async () => {
    await withEnvironmentTenant('tenant-env-1', async () => {
      const dbError = new Error('connect ECONNREFUSED 127.0.0.1:5432') as Error & { code?: string };
      dbError.code = '57P03';
      const api = createMinimalHttpApi({
        quoteRepository: {
          save: async () => {
            throw dbError;
          },
          getById: async () => null,
        },
        orderRepository: {
          save: async () => undefined,
          saveFromQuoteOnce: async () => ({ ok: true }),
          getById: async () => null,
          getBySourceQuoteId: async () => null,
        },
        customerRepository: {
          findStatusByTenantAndId: async () => {
            throw dbError;
          },
          list: async () => {
            throw dbError;
          },
          getById: async () => {
            throw dbError;
          },
          create: async () => {
            throw dbError;
          },
          update: async () => {
            throw dbError;
          },
        },
      });

      const response = await api(
        new Request('http://localhost/v0/quotes', {
          method: 'POST',
          headers: actorHeaders(),
          body: JSON.stringify({ id: 'q-http-db-down', customerId: 'c-1', numberSequence: 1 }),
        })
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database dependency unavailable',
      });
    });
  });
});
