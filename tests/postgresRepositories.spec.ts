import { describe, expect, it } from 'vitest';
import {
  PostgresOrderRepository,
  PostgresPaymentTermRepository,
  PostgresCustomerAddressRepository,
  PostgresCustomerCommercialProfileRepository,
  PostgresCustomerRepresentedCommercialProfileRepository,
  PostgresCustomerProductPriceOverrideRepository,
  PostgresCustomerContactRepository,
  PostgresCustomerRepository,
  PostgresPriceTableRepository,
  PostgresPriceTableItemRepository,
  PostgresQuoteRepository,
  PostgresProductRepository,
  PostgresRepresentedCompanyRepository,
  createQuote,
  convertQuoteToOrder,
  type SqlExecutor,
} from '../src/index.js';
import type { QueryResultRow } from 'pg';

class FakeSqlExecutor implements SqlExecutor {
  calls: Array<{ text: string; values?: unknown[] }> = [];
  resultRows: unknown[] = [];
  errorToThrow: (Error & { code?: string }) | null = null;
  async query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    this.calls.push({ text, values });
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }
    return {
      rows: this.resultRows as T[],
      rowCount: this.resultRows.length,
      command: 'SELECT',
      oid: 0,
      fields: [],
    };
  }

  async withTransaction<T>(fn: (client: SqlExecutor) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

describe('postgres repositories', () => {
  it('looks up customer status scoped by tenant and id', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [{ status: 'active' }];
    const repository = new PostgresCustomerRepository(db);

    const status = await repository.findStatusByTenantAndId({ tenantId: 'tenant-1', customerId: 'customer-1' });

    expect(status).toBe('active');
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.text).toContain('FROM customers');
    expect(db.calls[0]?.text).toContain('tenant_id = $1');
    expect(db.calls[0]?.text).toContain('id = $2');
    expect(db.calls[0]?.values).toEqual(['tenant-1', 'customer-1']);
  });

  it('returns null when customer is unavailable in tenant scope', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresCustomerRepository(db);

    const status = await repository.findStatusByTenantAndId({ tenantId: 'tenant-1', customerId: 'missing' });

    expect(status).toBeNull();
  });

  it('lists customers with tenant and representative ownership scope', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresCustomerRepository(db);

    await repository.list({ tenantId: 'tenant-1', actorId: 'rep-1', role: 'REPRESENTANTE', page: 1, pageSize: 20, q: 'Cliente' });

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.text).toContain('FROM customers');
    expect(db.calls[0]?.text).toContain('tenant_id = $1');
    expect(db.calls[0]?.text).toContain('owner_id = $2 OR representative_id = $2');
    expect(db.calls[0]?.text).toContain('ILIKE $3');
  });

  it('creates customer using expected tenant-scoped columns', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [customerRow({ id: 'customer-db-1' })];
    const repository = new PostgresCustomerRepository(db);

    const result = await repository.create({
      id: 'customer-db-1',
      tenantId: 'tenant-1',
      legalName: 'Cliente DB',
      documentType: 'cnpj',
      documentNumber: '123',
      status: 'active',
      ownerId: 'admin-1',
      representativeId: 'admin-1',
    });

    expect(result.id).toBe('customer-db-1');
    expect(db.calls[0]?.text).toContain('INSERT INTO customers');
    expect(db.calls[0]?.values?.slice(0, 7)).toEqual(['customer-db-1', 'tenant-1', 'Cliente DB', null, 'cnpj', '123', 'active']);
  });

  it('gets customer using tenant and id visibility scope', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [customerRow({ id: 'customer-db-2' })];
    const repository = new PostgresCustomerRepository(db);

    const result = await repository.getById({ tenantId: 'tenant-1', actorId: 'admin-1', role: 'ADMIN', customerId: 'customer-db-2' });

    expect(result?.id).toBe('customer-db-2');
    expect(db.calls[0]?.text).toContain('tenant_id = $1');
    expect(db.calls[0]?.text).toContain('id = $3');
    expect(db.calls[0]?.values).toEqual(['tenant-1', 'admin-1', 'customer-db-2']);
  });

  it('creates, lists and updates products scoped by tenant', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [productRow({ id: 'product-db-1' })];
    const repository = new PostgresProductRepository(db);

    const created = await repository.create({
      id: 'product-db-1',
      tenantId: 'tenant-1',
      representedCompanyId: 'represented-1',
      sku: 'SKU-DB-1',
      name: 'Produto DB',
      status: 'active',
    });

    expect(created.id).toBe('product-db-1');
    expect(db.calls[0]?.text).toContain('INSERT INTO products');
    expect(db.calls[0]?.values?.slice(0, 5)).toEqual(['product-db-1', 'tenant-1', 'represented-1', 'SKU-DB-1', 'Produto DB']);

    db.calls = [];
    await repository.list({ tenantId: 'tenant-1', actorId: 'rep-1', role: 'REPRESENTANTE', page: 1, pageSize: 20, q: 'Produto' });
    expect(db.calls[0]?.text).toContain('FROM products');
    expect(db.calls[0]?.text).toContain('tenant_id = $1');
    expect(db.calls[0]?.text).toContain('ILIKE $2');

    db.calls = [];
    await repository.update({ tenantId: 'tenant-1', actorId: 'admin-1', role: 'ADMIN', productId: 'product-db-1', patch: { name: 'Produto DB 2' } });
    expect(db.calls[0]?.text).toContain('FROM products');
    expect(db.calls[1]?.text).toContain('UPDATE products SET');
    expect(db.calls[1]?.text).toContain('WHERE tenant_id = $1 AND id = $2');
  });

  it('creates, lists and updates price tables scoped by tenant', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [priceTableRow({ id: 'price-table-db-1' })];
    const repository = new PostgresPriceTableRepository(db);

    const created = await repository.create({
      id: 'price-table-db-1',
      tenantId: 'tenant-1',
      representedCompanyId: 'represented-1',
      name: 'Tabela DB',
      currency: 'BRL',
      validFrom: '2026-01-01',
      status: 'active',
    });

    expect(created.id).toBe('price-table-db-1');
    expect(db.calls[0]?.text).toContain('INSERT INTO price_tables');
    expect(db.calls[0]?.values?.slice(0, 6)).toEqual(['price-table-db-1', 'tenant-1', 'represented-1', 'Tabela DB', 'BRL', '2026-01-01']);

    db.calls = [];
    await repository.list({ tenantId: 'tenant-1', actorId: 'rep-1', role: 'REPRESENTANTE', page: 1, pageSize: 20, q: 'Tabela' });
    expect(db.calls[0]?.text).toContain('FROM price_tables');
    expect(db.calls[0]?.text).toContain('tenant_id = $1');
    expect(db.calls[0]?.text).toContain('ILIKE $2');

    db.calls = [];
    await repository.update({ tenantId: 'tenant-1', actorId: 'admin-1', role: 'ADMIN', priceTableId: 'price-table-db-1', patch: { name: 'Tabela DB 2' } });
    expect(db.calls[0]?.text).toContain('FROM price_tables');
    expect(db.calls[1]?.text).toContain('UPDATE price_tables SET');
    expect(db.calls[1]?.text).toContain('WHERE tenant_id = $1 AND id = $2');
  });

  it('creates, lists and updates price table items scoped by tenant and table', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [priceTableItemRow({ id: 'price-table-item-db-1' })];
    const repository = new PostgresPriceTableItemRepository(db);

    const created = await repository.create({
      id: 'price-table-item-db-1',
      tenantId: 'tenant-1',
      priceTableId: 'price-table-db-1',
      productId: 'product-db-1',
      unitPrice: 10.25,
      validFrom: '2026-01-01',
      status: 'active',
    });

    expect(created.id).toBe('price-table-item-db-1');
    expect(db.calls[0]?.text).toContain('INSERT INTO price_table_items');
    expect(db.calls[0]?.values?.slice(0, 6)).toEqual(['price-table-item-db-1', 'tenant-1', 'price-table-db-1', 'product-db-1', 10.25, '2026-01-01']);

    db.calls = [];
    await repository.listByPriceTable({ tenantId: 'tenant-1', actorId: 'rep-1', role: 'REPRESENTANTE', priceTableId: 'price-table-db-1', page: 1, pageSize: 20 });
    expect(db.calls[0]?.text).toContain('FROM price_table_items');
    expect(db.calls[0]?.text).toContain('tenant_id = $1 AND price_table_id = $2');

    db.calls = [];
    await repository.update({ tenantId: 'tenant-1', actorId: 'admin-1', role: 'ADMIN', priceTableId: 'price-table-db-1', itemId: 'price-table-item-db-1', patch: { unitPrice: 11 } });
    expect(db.calls[0]?.text).toContain('FROM price_table_items');
    expect(db.calls[1]?.text).toContain('UPDATE price_table_items SET');

    db.calls = [];
    db.resultRows = [{ exists: true }];
    const overlap = await repository.hasActiveOverlap({ tenantId: 'tenant-1', priceTableId: 'price-table-db-1', productId: 'product-db-1', validFrom: '2026-01-01', validUntil: '2026-12-31' });
    expect(overlap).toBe(true);
    expect(db.calls[0]?.text).toContain('SELECT EXISTS');
    expect(db.calls[0]?.text).toContain('status = \'active\'');
  });

  it('creates, lists and updates payment terms scoped by tenant', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [paymentTermRow({ id: 'payment-term-db-1' })];
    const repository = new PostgresPaymentTermRepository(db);

    const created = await repository.create({
      id: 'payment-term-db-1',
      tenantId: 'tenant-1',
      name: '30/60/90',
      description: 'Três parcelas',
      installmentsCount: 3,
      firstDueDays: 30,
      intervalDays: 30,
      status: 'active',
    });

    expect(created.id).toBe('payment-term-db-1');
    expect(db.calls[0]?.text).toContain('INSERT INTO payment_terms');
    expect(db.calls[0]?.values?.slice(0, 7)).toEqual(['payment-term-db-1', 'tenant-1', '30/60/90', 'Três parcelas', 3, 30, 30]);

    db.calls = [];
    await repository.list({ tenantId: 'tenant-1', actorId: 'rep-1', role: 'REPRESENTANTE', page: 1, pageSize: 20, q: '30/60' });
    expect(db.calls[0]?.text).toContain('FROM payment_terms');
    expect(db.calls[0]?.text).toContain('tenant_id = $1');
    expect(db.calls[0]?.text).toContain('ILIKE $2');

    db.calls = [];
    await repository.update({ tenantId: 'tenant-1', actorId: 'admin-1', role: 'ADMIN', paymentTermId: 'payment-term-db-1', patch: { name: '30/60', installmentsCount: 2 } });
    expect(db.calls[0]?.text).toContain('FROM payment_terms');
    expect(db.calls[1]?.text).toContain('UPDATE payment_terms SET');
    expect(db.calls[1]?.text).toContain('WHERE tenant_id = $1 AND id = $2');
  });

  it('gets and upserts customer commercial profile defaults', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [customerCommercialProfileRow({ default_price_table_id: 'price-table-db-1' })];
    const repository = new PostgresCustomerCommercialProfileRepository(db);

    const current = await repository.getByCustomer({ tenantId: 'tenant-1', customerId: 'customer-db-1' });
    expect(current?.defaultPriceTableId).toBe('price-table-db-1');
    expect(db.calls[0]?.text).toContain('FROM customer_commercial_profiles');
    expect(db.calls[0]?.text).toContain('tenant_id = $1 AND customer_id = $2');

    db.calls = [];
    db.resultRows = [customerCommercialProfileRow({ default_price_table_id: 'price-table-db-2' })];
    const updated = await repository.upsertDefaultPriceTable({ tenantId: 'tenant-1', customerId: 'customer-db-1', defaultPriceTableId: 'price-table-db-2' });
    expect(updated.defaultPriceTableId).toBe('price-table-db-2');
    expect(db.calls[0]?.text).toContain('INSERT INTO customer_commercial_profiles');
    expect(db.calls[0]?.text).toContain('ON CONFLICT (tenant_id, customer_id) DO UPDATE SET');
    expect(db.calls[0]?.values?.slice(0, 3)).toEqual(['tenant-1', 'customer-db-1', 'price-table-db-2']);

    db.calls = [];
    db.resultRows = [customerCommercialProfileRow({ default_price_table_id: null })];
    const cleared = await repository.upsertDefaultPriceTable({ tenantId: 'tenant-1', customerId: 'customer-db-1', defaultPriceTableId: null });
    expect(cleared.defaultPriceTableId).toBeUndefined();
    expect(db.calls[0]?.values?.[2]).toBeNull();

    db.calls = [];
    db.resultRows = [customerCommercialProfileRow({ default_payment_term_id: 'payment-term-db-1' })];
    const termUpdated = await repository.upsertDefaultPaymentTerm({ tenantId: 'tenant-1', customerId: 'customer-db-1', defaultPaymentTermId: 'payment-term-db-1' });
    expect(termUpdated.defaultPaymentTermId).toBe('payment-term-db-1');
    expect(db.calls[0]?.text).toContain('INSERT INTO customer_commercial_profiles');
    expect(db.calls[0]?.text).toContain('default_payment_term_id = EXCLUDED.default_payment_term_id');
    expect(db.calls[0]?.values?.slice(0, 3)).toEqual(['tenant-1', 'customer-db-1', 'payment-term-db-1']);

    db.calls = [];
    db.resultRows = [customerCommercialProfileRow({ default_payment_term_id: null })];
    const termCleared = await repository.upsertDefaultPaymentTerm({ tenantId: 'tenant-1', customerId: 'customer-db-1', defaultPaymentTermId: null });
    expect(termCleared.defaultPaymentTermId).toBeUndefined();
    expect(db.calls[0]?.values?.[2]).toBeNull();
  });

  it('gets represented company and upserts customer represented commercial profile', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [representedCompanyRow({ id: 'represented-db-1' })];
    const representedRepository = new PostgresRepresentedCompanyRepository(db);

    const represented = await representedRepository.getById({ tenantId: 'tenant-1', representedCompanyId: 'represented-db-1' });
    expect(represented?.id).toBe('represented-db-1');
    expect(db.calls[0]?.text).toContain('FROM represented_companies');
    expect(db.calls[0]?.text).toContain('tenant_id = $1 AND id = $2');

    db.calls = [];
    db.resultRows = [customerRepresentedCommercialProfileRow({ represented_company_id: 'represented-db-1' })];
    const profileRepository = new PostgresCustomerRepresentedCommercialProfileRepository(db);

    const current = await profileRepository.getByCustomerAndRepresented({ tenantId: 'tenant-1', customerId: 'customer-db-1', representedCompanyId: 'represented-db-1' });
    expect(current?.representedCompanyId).toBe('represented-db-1');
    expect(db.calls[0]?.text).toContain('FROM customer_represented_commercial_profiles');
    expect(db.calls[0]?.text).toContain('tenant_id = $1 AND customer_id = $2 AND represented_company_id = $3');

    db.calls = [];
    db.resultRows = [customerRepresentedCommercialProfileRow({ default_price_table_id: 'price-table-db-1', default_payment_term_id: 'payment-term-db-1' })];
    const updated = await profileRepository.upsertDefaults({
      tenantId: 'tenant-1',
      customerId: 'customer-db-1',
      representedCompanyId: 'represented-db-1',
      defaultPriceTableId: 'price-table-db-1',
      defaultPaymentTermId: 'payment-term-db-1',
    });
    expect(updated.defaultPriceTableId).toBe('price-table-db-1');
    expect(updated.defaultPaymentTermId).toBe('payment-term-db-1');
    expect(db.calls[0]?.text).toContain('INSERT INTO customer_represented_commercial_profiles');
    expect(db.calls[0]?.text).toContain('ON CONFLICT (tenant_id, customer_id, represented_company_id) DO UPDATE SET');
    expect(db.calls[0]?.values?.slice(0, 5)).toEqual(['tenant-1', 'customer-db-1', 'represented-db-1', 'price-table-db-1', 'payment-term-db-1']);
  });

  it('creates, lists, updates and resolves customer product price overrides scoped by tenant/customer/represented/product', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [customerProductPriceOverrideRow({ id: 'override-db-1' })];
    const repository = new PostgresCustomerProductPriceOverrideRepository(db);

    const created = await repository.create({
      id: 'override-db-1',
      tenantId: 'tenant-1',
      customerId: 'customer-db-1',
      representedCompanyId: 'represented-db-1',
      productId: 'product-db-1',
      unitPrice: 88.25,
      validFrom: '2026-01-01',
      status: 'active',
    });

    expect(created.id).toBe('override-db-1');
    expect(db.calls[0]?.text).toContain('INSERT INTO customer_product_price_overrides');
    expect(db.calls[0]?.values?.slice(0, 7)).toEqual(['override-db-1', 'tenant-1', 'customer-db-1', 'represented-db-1', 'product-db-1', 88.25, '2026-01-01']);

    db.calls = [];
    await repository.list({ tenantId: 'tenant-1', actorId: 'rep-1', role: 'REPRESENTANTE', customerId: 'customer-db-1', representedCompanyId: 'represented-db-1', page: 1, pageSize: 20 });
    expect(db.calls[0]?.text).toContain('FROM customer_product_price_overrides');
    expect(db.calls[0]?.text).toContain('tenant_id = $1 AND customer_id = $2 AND represented_company_id = $3');

    db.calls = [];
    await repository.update({ tenantId: 'tenant-1', actorId: 'admin-1', role: 'ADMIN', customerId: 'customer-db-1', representedCompanyId: 'represented-db-1', overrideId: 'override-db-1', patch: { unitPrice: 87, status: 'inactive' } });
    expect(db.calls[0]?.text).toContain('FROM customer_product_price_overrides');
    expect(db.calls[1]?.text).toContain('UPDATE customer_product_price_overrides SET');
    expect(db.calls[1]?.text).toContain('WHERE tenant_id = $1 AND customer_id = $2 AND represented_company_id = $3 AND id = $4');

    db.calls = [];
    db.resultRows = [customerProductPriceOverrideRow({ id: 'override-db-1', unit_price: '88.2500' })];
    const active = await repository.findActive({ tenantId: 'tenant-1', customerId: 'customer-db-1', representedCompanyId: 'represented-db-1', productId: 'product-db-1', onDate: '2026-06-01' });
    expect(active?.unitPrice).toBe(88.25);
    expect(db.calls[0]?.text).toContain('status = \'active\'');
    expect(db.calls[0]?.text).toContain('valid_from <= $5::date');

    db.calls = [];
    db.resultRows = [{ exists: true }];
    const duplicate = await repository.hasActiveForScope({ tenantId: 'tenant-1', customerId: 'customer-db-1', representedCompanyId: 'represented-db-1', productId: 'product-db-1' });
    expect(duplicate).toBe(true);
    expect(db.calls[0]?.text).toContain('SELECT EXISTS');
    expect(db.calls[0]?.text).toContain('status = \'active\'');
  });

  it('creates, lists and updates customer contacts scoped by tenant/customer with primary behavior', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [contactRow({ id: 'contact-db-1', is_primary: true })];
    const repository = new PostgresCustomerContactRepository(db);

    const created = await repository.create({
      id: 'contact-db-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      name: 'Contato DB',
      email: 'db@example.com',
      isPrimary: true,
      status: 'active',
    });

    expect(created.id).toBe('contact-db-1');
    expect(db.calls[0]?.text).toContain('pg_advisory_xact_lock');
    expect(db.calls[1]?.text).toContain('UPDATE customer_contacts');
    expect(db.calls[1]?.text).toContain('tenant_id = $1 AND customer_id = $2');
    expect(db.calls[2]?.text).toContain('INSERT INTO customer_contacts');
    expect(db.calls[2]?.values?.slice(0, 4)).toEqual(['contact-db-1', 'tenant-1', 'customer-1', 'Contato DB']);

    db.calls = [];
    await repository.listByCustomer({ tenantId: 'tenant-1', customerId: 'customer-1' });
    expect(db.calls[0]?.text).toContain('FROM customer_contacts');
    expect(db.calls[0]?.text).toContain('tenant_id = $1 AND customer_id = $2');

    db.calls = [];
    await repository.update({ tenantId: 'tenant-1', customerId: 'customer-1', contactId: 'contact-db-1', patch: { phone: '11999999999' } });
    expect(db.calls[0]?.text).toContain('WHERE tenant_id = $1 AND customer_id = $2 AND id = $3');
    expect(db.calls[1]?.text).toContain('pg_advisory_xact_lock');
    expect(db.calls[2]?.text).toContain('UPDATE customer_contacts');
    expect(db.calls[2]?.text).toContain('id <> $3');
    expect(db.calls[3]?.text).toContain('UPDATE customer_contacts SET');
    expect(db.calls[3]?.values?.[2]).toBe('contact-db-1');
  });

  it('creates, lists and updates customer addresses scoped by tenant/customer with primary behavior', async () => {
    const db = new FakeSqlExecutor();
    db.resultRows = [addressRow({ id: 'address-db-1', is_primary: true })];
    const repository = new PostgresCustomerAddressRepository(db);

    const created = await repository.create({
      id: 'address-db-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      addressType: 'main',
      street: 'Rua DB',
      city: 'São Paulo',
      state: 'SP',
      country: 'BR',
      isPrimary: true,
      status: 'active',
    });

    expect(created.id).toBe('address-db-1');
    expect(db.calls[0]?.text).toContain('pg_advisory_xact_lock');
    expect(db.calls[1]?.text).toContain('UPDATE customer_addresses');
    expect(db.calls[1]?.text).toContain('tenant_id = $1 AND customer_id = $2');
    expect(db.calls[2]?.text).toContain('INSERT INTO customer_addresses');
    expect(db.calls[2]?.values?.slice(0, 6)).toEqual(['address-db-1', 'tenant-1', 'customer-1', 'main', null, 'Rua DB']);

    db.calls = [];
    await repository.listByCustomer({ tenantId: 'tenant-1', customerId: 'customer-1' });
    expect(db.calls[0]?.text).toContain('FROM customer_addresses');
    expect(db.calls[0]?.text).toContain('tenant_id = $1 AND customer_id = $2');

    db.calls = [];
    await repository.update({ tenantId: 'tenant-1', customerId: 'customer-1', addressId: 'address-db-1', patch: { number: '100' } });
    expect(db.calls[0]?.text).toContain('WHERE tenant_id = $1 AND customer_id = $2 AND id = $3');
    expect(db.calls[1]?.text).toContain('pg_advisory_xact_lock');
    expect(db.calls[2]?.text).toContain('UPDATE customer_addresses');
    expect(db.calls[2]?.text).toContain('id <> $3');
    expect(db.calls[3]?.text).toContain('UPDATE customer_addresses SET');
    expect(db.calls[3]?.values?.[2]).toBe('address-db-1');
  });

  it('enforces quote repository document type', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresQuoteRepository(db);
    const quote = createQuote({
      id: 'q-db-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 1,
    });
    const converted = convertQuoteToOrder(quote, 10);
    if (!converted.ok) return;

    await expect(repository.save(converted.document)).rejects.toThrowError('QUOTE_REPOSITORY_ONLY_ACCEPTS_QUOTES');
  });

  it('preserves source_quote_id uniqueness conflict contract on saveFromQuoteOnce', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresOrderRepository(db);
    const conflictError = new Error('duplicate key') as Error & { code?: string };
    conflictError.code = '23505';
    db.errorToThrow = conflictError;

    const quote = createQuote({
      id: 'q-db-2',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 2,
    });
    const converted = convertQuoteToOrder(quote, 20);
    if (!converted.ok) return;

    const result = await repository.saveFromQuoteOnce(converted.document);
    expect(result.ok).toBe(false);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.text).toContain('INSERT INTO commercial_documents');
  });

  it('persists represented_company_id when saving quote', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresQuoteRepository(db);
    const quote = createQuote({
      id: 'q-db-represented',
      tenantId: 'tenant-1',
      representedCompanyId: 'represented-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 12,
    });

    await repository.save(quote);

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.text).toContain('represented_company_id');
    expect(db.calls[0]?.values?.[4]).toBe('represented-1');
  });

  it('order save upserts only the order row without mutating source quote row', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresOrderRepository(db);

    const quote = createQuote({
      id: 'q-db-3',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 3,
    });
    const converted = convertQuoteToOrder(quote, 30);
    if (!converted.ok) return;

    await repository.save(converted.document);

    expect(db.calls).toHaveLength(1);
    const sql = db.calls[0]?.text ?? '';
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(sql).toContain('document_type = EXCLUDED.document_type');
    expect(sql).toContain('source_quote_id = EXCLUDED.source_quote_id');
    expect(sql).toContain('source_quote_snapshot = EXCLUDED.source_quote_snapshot');
    expect(db.calls[0]?.values?.[0]).not.toBe(quote.id);
    expect(converted.document.source_quote_id).toBe(quote.id);
  });

  it('saveFromQuoteOnce inserts without id upsert so duplicate source quote conflicts are not hidden', async () => {
    const db = new FakeSqlExecutor();
    const repository = new PostgresOrderRepository(db);

    const quote = createQuote({
      id: 'q-db-4',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 4,
    });
    const converted = convertQuoteToOrder(quote, 40);
    if (!converted.ok) return;

    const result = await repository.saveFromQuoteOnce(converted.document);

    expect(result.ok).toBe(true);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.text).toContain('INSERT INTO commercial_documents');
    expect(db.calls[0]?.text).toContain('represented_company_id');
    expect(db.calls[0]?.text).not.toContain('ON CONFLICT (id) DO UPDATE SET');
  });
});

function customerRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'customer-db',
    tenant_id: 'tenant-1',
    legal_name: 'Cliente DB',
    trade_name: null,
    document_type: 'cnpj',
    document_number: '123',
    status: 'active',
    segment: null,
    notes: null,
    owner_id: 'admin-1',
    representative_id: 'admin-1',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function productRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'product-db',
    tenant_id: 'tenant-1',
    represented_company_id: 'represented-1',
    sku: 'SKU-DB-1',
    name: 'Produto DB',
    description: null,
    commercial_name: null,
    barcode: null,
    brand: null,
    category_id: null,
    unit_id: null,
    package_info: null,
    minimum_order_quantity: null,
    multiple_order_quantity: null,
    gross_weight: null,
    net_weight: null,
    dimensions: null,
    availability_status: null,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function priceTableRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'price-table-db',
    tenant_id: 'tenant-1',
    represented_company_id: 'represented-1',
    name: 'Tabela DB',
    currency: 'BRL',
    valid_from: '2026-01-01',
    valid_until: null,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function priceTableItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'price-table-item-db',
    tenant_id: 'tenant-1',
    price_table_id: 'price-table-db-1',
    product_id: 'product-db-1',
    unit_price: '10.2500',
    valid_from: '2026-01-01',
    valid_until: null,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function paymentTermRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'payment-term-db',
    tenant_id: 'tenant-1',
    name: '30/60/90',
    description: 'Três parcelas',
    installments_count: 3,
    first_due_days: 30,
    interval_days: 30,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function customerCommercialProfileRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tenant_id: 'tenant-1',
    customer_id: 'customer-db-1',
    default_payment_term_id: null,
    default_price_table_id: null,
    credit_limit: null,
    notes: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function representedCompanyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'represented-db',
    tenant_id: 'tenant-1',
    name: 'Representada DB',
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function customerRepresentedCommercialProfileRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tenant_id: 'tenant-1',
    customer_id: 'customer-db-1',
    represented_company_id: 'represented-db-1',
    default_price_table_id: null,
    default_payment_term_id: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function customerProductPriceOverrideRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'override-db',
    tenant_id: 'tenant-1',
    customer_id: 'customer-db-1',
    represented_company_id: 'represented-db-1',
    product_id: 'product-db-1',
    unit_price: '88.2500',
    valid_from: '2026-01-01',
    valid_until: null,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function contactRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'contact-db',
    tenant_id: 'tenant-1',
    customer_id: 'customer-1',
    name: 'Contato DB',
    role_title: null,
    phone: null,
    whatsapp: null,
    email: null,
    is_primary: false,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function addressRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'address-db',
    tenant_id: 'tenant-1',
    customer_id: 'customer-1',
    address_type: 'main',
    zipcode: null,
    street: 'Rua DB',
    number: null,
    complement: null,
    district: null,
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    is_primary: false,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}
