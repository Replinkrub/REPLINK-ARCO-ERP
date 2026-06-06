import { describe, expect, it } from 'vitest';
import {
  PostgresOrderRepository,
  PostgresCustomerAddressRepository,
  PostgresCustomerContactRepository,
  PostgresCustomerRepository,
  PostgresQuoteRepository,
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
