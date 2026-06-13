import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import {
  PostgresClient,
  PostgresCustomerAddressRepository,
  PostgresCustomerCommercialProfileRepository,
  PostgresCustomerRepresentedCommercialProfileRepository,
  PostgresCustomerProductPriceOverrideRepository,
  PostgresCustomerContactRepository,
  PostgresCustomerRepository,
  PostgresOrderRepository,
  PostgresPaymentTermRepository,
  PostgresPriceTableRepository,
  PostgresPriceTableItemRepository,
  PostgresProductRepository,
  PostgresQuoteRepository,
  PostgresRepresentedCompanyRepository,
  createMinimalHttpApi,
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run npm run test:smoke:db');
}

async function expectPgError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected Postgres error ${code}, but operation succeeded`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('db smoke (real postgres)', () => {
  const now = Date.now();
  const quoteId = `q-smoke-${now}`;
  const tenantId = process.env.APP_TENANT_ID?.trim() || `tenant-smoke-${now}`;
  const baseSequence = 100000 + (now % 700000);

  const db = new PostgresClient(databaseUrl as string);
  const pgClient = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await pgClient.connect();
    await pgClient.query(
      `INSERT INTO tenants (id, name, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [tenantId, `Smoke Tenant ${now}`]
    );
  });

  afterAll(async () => {
    await pgClient.end();
    await db.close();
  });

  it('persists quote + order through minimal HTTP API flow', async () => {
    process.env.APP_TENANT_ID = tenantId;
    await pgClient.query(
      `INSERT INTO customers (id, tenant_id, legal_name, document_type, document_number, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [`customer-smoke-${now}`, tenantId, `Customer Smoke ${now}`, 'cnpj', `DOC-SMOKE-${now}`]
    );
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
      customerRepository: new PostgresCustomerRepository(db),
    });

    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-smoke-${now}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };

    const createResponse = await api(new Request('http://localhost/v0/quotes', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: quoteId,
        customerId: `customer-smoke-${now}`,
        ownerId: `owner-smoke-${now}`,
        representativeId: `rep-smoke-${now}`,
        numberSequence: baseSequence,
      }),
    }));
    expect(createResponse.status).toBe(201);

    const createdQuoteRow = await pgClient.query(
      'SELECT id, document_type, tenant_id, status FROM commercial_documents WHERE id = $1 LIMIT 1',
      [quoteId]
    );
    expect(createdQuoteRow.rowCount).toBe(1);
    expect(createdQuoteRow.rows[0]?.document_type).toBe('quote');
    expect(createdQuoteRow.rows[0]?.tenant_id).toBe(tenantId);

    const confirmResponse = await api(new Request(`http://localhost/v0/quotes/${quoteId}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderSequence: baseSequence + 1 }),
    }));
    expect(confirmResponse.status).toBe(200);

    const quoteRow = await pgClient.query(
      'SELECT id, document_type, number, status FROM commercial_documents WHERE id = $1 LIMIT 1',
      [quoteId]
    );
    expect(quoteRow.rowCount).toBe(1);
    expect(quoteRow.rows[0]?.document_type).toBe('quote');
    expect(quoteRow.rows[0]?.number).toMatch(/^ORC-/);

    const orderRow = await pgClient.query(
      'SELECT id, source_quote_id, document_type, tenant_id, number, status FROM commercial_documents WHERE source_quote_id = $1 LIMIT 1',
      [quoteId]
    );
    expect(orderRow.rowCount).toBe(1);
    expect(orderRow.rows[0]?.id).not.toBe(quoteId);
    expect(orderRow.rows[0]?.document_type).toBe('order');
    expect(orderRow.rows[0]?.tenant_id).toBe(tenantId);
    expect(orderRow.rows[0]?.number).toMatch(/^PED-/);

    const duplicateConfirmResponse = await api(new Request(`http://localhost/v0/quotes/${quoteId}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderSequence: baseSequence + 1 }),
    }));
    expect(duplicateConfirmResponse.status).toBe(409);

    const orderCount = await pgClient.query(
      'SELECT COUNT(*)::int AS count FROM commercial_documents WHERE source_quote_id = $1 AND document_type = $2',
      [quoteId, 'order']
    );
    expect(orderCount.rows[0]?.count).toBe(1);
  });

  it('validates security tenant roles and audit foundation', async () => {
    const securityTenantId = `tenant-security-${now}`;
    const userId = `user-security-${now}`;

    const roles = await pgClient.query(
      'SELECT code, status FROM roles WHERE code = ANY($1::text[]) ORDER BY code',
      [['ADMIN', 'GESTOR_COMERCIAL', 'REPRESENTANTE']]
    );
    expect(roles.rows).toEqual([
      { code: 'ADMIN', status: 'active' },
      { code: 'GESTOR_COMERCIAL', status: 'reserved' },
      { code: 'REPRESENTANTE', status: 'active' },
    ]);

    await expectPgError(
      pgClient.query("INSERT INTO roles (id, code, status) VALUES ($1, 'VISUALIZADOR', 'active')", [
        `role-visualizador-${now}`,
      ]),
      '23514'
    );

    await pgClient.query('INSERT INTO tenants (id, name, status) VALUES ($1, $2, $3)', [
      securityTenantId,
      `Security Tenant ${now}`,
      'active',
    ]);
    await pgClient.query('INSERT INTO tenant_memberships (id, tenant_id, user_id, status) VALUES ($1, $2, $3, $4)', [
      `membership-${now}`,
      securityTenantId,
      userId,
      'active',
    ]);

    await expectPgError(
      pgClient.query('INSERT INTO tenant_memberships (id, tenant_id, user_id, status) VALUES ($1, $2, $3, $4)', [
        `membership-duplicate-${now}`,
        securityTenantId,
        userId,
        'active',
      ]),
      '23505'
    );

    await pgClient.query('INSERT INTO user_roles (id, tenant_id, user_id, role_code, status) VALUES ($1, $2, $3, $4, $5)', [
      `user-role-${now}`,
      securityTenantId,
      userId,
      'ADMIN',
      'active',
    ]);

    await expectPgError(
      pgClient.query('INSERT INTO user_roles (id, tenant_id, user_id, role_code, status) VALUES ($1, $2, $3, $4, $5)', [
        `user-role-duplicate-${now}`,
        securityTenantId,
        userId,
        'ADMIN',
        'active',
      ]),
      '23505'
    );

    await pgClient.query(
      `INSERT INTO audit_events (id, tenant_id, actor_id, actor_role, entity_type, entity_id, action, result, reason_code, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        `audit-denied-${now}`,
        securityTenantId,
        userId,
        'REPRESENTANTE',
        'commercial_document',
        `outside-wallet-${now}`,
        'view_confirmed_order',
        'denied',
        'OWNERSHIP_DENIED',
        JSON.stringify({ attemptedTenantId: securityTenantId }),
      ]
    );

    const auditEvent = await pgClient.query('SELECT result FROM audit_events WHERE id = $1', [`audit-denied-${now}`]);
    expect(auditEvent.rows[0]?.result).toBe('denied');

    await expectPgError(
      pgClient.query(
        `INSERT INTO audit_events (id, tenant_id, entity_type, action, result)
         VALUES ($1, $2, $3, $4, $5)`,
        [`audit-invalid-${now}`, securityTenantId, 'tenant', 'invalid_result_test', 'blocked']
      ),
      '23514'
    );
  });

  it('enforces commercial document tenant foreign key', async () => {
    const constraint = await pgClient.query(
      `SELECT conname
       FROM pg_constraint
       WHERE conname = $1
         AND conrelid = 'commercial_documents'::regclass
       LIMIT 1`,
      ['commercial_documents_tenant_id_fkey']
    );
    expect(constraint.rowCount).toBe(1);

    await expectPgError(
      pgClient.query(
        `INSERT INTO commercial_documents (
          id, document_type, number, tenant_id, customer_id, owner_id, representative_id, status,
          items, totals, created_at, updated_at
        ) VALUES (
          $1, 'quote', $2, $3, $4, $5, $6, 'QUOTE_DRAFT',
          $7::jsonb, $8::jsonb, now(), now()
        )`,
        [
          `q-invalid-tenant-${now}`,
          `ORC-${baseSequence + 2}`,
          `tenant-invalid-${now}`,
          `customer-invalid-tenant-${now}`,
          `owner-invalid-tenant-${now}`,
          `rep-invalid-tenant-${now}`,
          JSON.stringify([]),
          JSON.stringify({ subtotal: 0, discountTotal: 0, grandTotal: 0 }),
        ]
      ),
      '23503'
    );
  });

  it('validates customers tenant-scoped foundation', async () => {
    const customerId = `customer-core-${now}`;
    const otherTenantId = `tenant-customer-other-${now}`;

    await pgClient.query('INSERT INTO tenants (id, name, status) VALUES ($1, $2, $3)', [
      otherTenantId,
      `Customer Other Tenant ${now}`,
      'active',
    ]);

    await pgClient.query(
      `INSERT INTO customers (id, tenant_id, legal_name, document_type, document_number, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [customerId, tenantId, `Customer Core ${now}`, 'cnpj', `DOC-CUSTOMER-${now}`]
    );

    await pgClient.query(
      `INSERT INTO customer_contacts (id, tenant_id, customer_id, name, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [`contact-core-${now}`, tenantId, customerId, `Contact ${now}`]
    );
    await pgClient.query(
      `INSERT INTO customer_addresses (id, tenant_id, customer_id, address_type, street, city, state, status)
       VALUES ($1, $2, $3, 'main', $4, $5, $6, 'active')`,
      [`address-core-${now}`, tenantId, customerId, `Street ${now}`, 'Cidade', 'SP']
    );
    await pgClient.query(
      `INSERT INTO customer_commercial_profiles (tenant_id, customer_id, credit_limit)
       VALUES ($1, $2, $3)`,
      [tenantId, customerId, 1000]
    );

    await expectPgError(
      pgClient.query(
        `INSERT INTO customer_contacts (id, tenant_id, customer_id, name, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [`contact-cross-${now}`, otherTenantId, customerId, `Cross Contact ${now}`]
      ),
      '23503'
    );

    await expectPgError(
      pgClient.query(
        `INSERT INTO customer_addresses (id, tenant_id, customer_id, address_type, street, city, state, status)
         VALUES ($1, $2, $3, 'invalid', $4, $5, $6, 'active')`,
        [`address-invalid-${now}`, tenantId, customerId, `Street ${now}`, 'Cidade', 'SP']
      ),
      '23514'
    );

    await expectPgError(
      pgClient.query(
        `INSERT INTO customer_commercial_profiles (tenant_id, customer_id, credit_limit)
         VALUES ($1, $2, $3)`,
        [tenantId, customerId, 2000]
      ),
      '23505'
    );
  });

  it('exercises Products API foundation against real postgres', async () => {
    process.env.APP_TENANT_ID = tenantId;
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
      customerRepository: new PostgresCustomerRepository(db),
      productRepository: new PostgresProductRepository(db),
    });
    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-product-api-${now}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };
    const productId = `product-api-smoke-${now}`;
    const sku = `SKU-API-SMOKE-${now}`;

    const createResponse = await api(new Request('http://localhost/v1/products', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: productId, sku, name: `Product API Smoke ${now}`, minimum_order_quantity: 1 }),
    }));
    expect(createResponse.status).toBe(201);

    const productRow = await pgClient.query(
      'SELECT id, tenant_id, sku, represented_company_id FROM products WHERE id = $1 LIMIT 1',
      [productId]
    );
    expect(productRow.rowCount).toBe(1);
    expect(productRow.rows[0]).toMatchObject({ id: productId, tenant_id: tenantId, sku, represented_company_id: null });

    const listResponse = await api(new Request(`http://localhost/v1/products?q=${sku}`, { headers }));
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json() as { items: Array<{ id: string }> };
    expect(list.items.some((item) => item.id === productId)).toBe(true);

    const patchResponse = await api(new Request(`http://localhost/v1/products/${productId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: `Product API Smoke Updated ${now}`, status: 'inactive' }),
    }));
    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json() as { status: string; name: string };
    expect(patched.status).toBe('inactive');

    const duplicateResponse = await api(new Request('http://localhost/v1/products', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: `product-api-smoke-duplicate-${now}`, sku, name: `Product Duplicate ${now}` }),
    }));
    expect(duplicateResponse.status).toBe(422);
    const duplicate = await duplicateResponse.json() as { code: string };
    expect(duplicate.code).toBe('DUPLICATE_PRODUCT_SKU');
  });

  it('exercises Price Tables API core against real postgres', async () => {
    process.env.APP_TENANT_ID = tenantId;
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
      customerRepository: new PostgresCustomerRepository(db),
      priceTableRepository: new PostgresPriceTableRepository(db),
    });
    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-price-table-api-${now}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };
    const priceTableId = `price-table-api-smoke-${now}`;
    const priceTableName = `Price Table API Smoke ${now}`;

    const createResponse = await api(new Request('http://localhost/v1/price-tables', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: priceTableId, name: priceTableName, valid_from: '2026-01-01' }),
    }));
    expect(createResponse.status).toBe(201);

    const priceTableRow = await pgClient.query(
      'SELECT id, tenant_id, name, represented_company_id, currency FROM price_tables WHERE id = $1 LIMIT 1',
      [priceTableId]
    );
    expect(priceTableRow.rowCount).toBe(1);
    expect(priceTableRow.rows[0]).toMatchObject({ id: priceTableId, tenant_id: tenantId, name: priceTableName, represented_company_id: null, currency: 'BRL' });

    const listResponse = await api(new Request(`http://localhost/v1/price-tables?q=${encodeURIComponent(priceTableName)}`, { headers }));
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json() as { items: Array<{ id: string }> };
    expect(list.items.some((item) => item.id === priceTableId)).toBe(true);

    const patchResponse = await api(new Request(`http://localhost/v1/price-tables/${priceTableId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: `${priceTableName} Updated`, status: 'inactive' }),
    }));
    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json() as { status: string; name: string };
    expect(patched.status).toBe('inactive');

    const duplicateResponse = await api(new Request('http://localhost/v1/price-tables', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: `price-table-api-smoke-duplicate-${now}`, name: `${priceTableName} Updated`, valid_from: '2026-01-01' }),
    }));
    expect(duplicateResponse.status).toBe(422);
    const duplicate = await duplicateResponse.json() as { code: string };
    expect(duplicate.code).toBe('DUPLICATE_PRICE_TABLE');
  });

  it('exercises Payment Terms API foundation against real postgres', async () => {
    process.env.APP_TENANT_ID = tenantId;
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
      customerRepository: new PostgresCustomerRepository(db),
      paymentTermRepository: new PostgresPaymentTermRepository(db),
    });
    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-payment-term-api-${now}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };
    const paymentTermId = `payment-term-api-smoke-${now}`;
    const paymentTermName = `Payment Term API Smoke ${now}`;

    const createResponse = await api(new Request('http://localhost/v1/payment-terms', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: paymentTermId, name: paymentTermName, installments_count: 3, first_due_days: 30, interval_days: 30 }),
    }));
    expect(createResponse.status).toBe(201);

    const paymentTermRow = await pgClient.query(
      'SELECT id, tenant_id, name, installments_count, first_due_days, interval_days FROM payment_terms WHERE tenant_id = $1 AND id = $2 LIMIT 1',
      [tenantId, paymentTermId]
    );
    expect(paymentTermRow.rowCount).toBe(1);
    expect(paymentTermRow.rows[0]).toMatchObject({ id: paymentTermId, tenant_id: tenantId, name: paymentTermName, installments_count: 3, first_due_days: 30, interval_days: 30 });

    const listResponse = await api(new Request(`http://localhost/v1/payment-terms?q=${encodeURIComponent(paymentTermName)}`, { headers: { ...headers, 'x-actor-role': 'REPRESENTANTE', 'x-actor-id': `rep-payment-term-api-${now}` } }));
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json() as { items: Array<{ id: string }> };
    expect(list.items.some((item) => item.id === paymentTermId)).toBe(true);

    const patchResponse = await api(new Request(`http://localhost/v1/payment-terms/${paymentTermId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: `${paymentTermName} Updated`, installments_count: 2, status: 'inactive' }),
    }));
    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json() as { status: string; name: string; installmentsCount: number };
    expect(patched.status).toBe('inactive');
    expect(patched.installmentsCount).toBe(2);

    const duplicateResponse = await api(new Request('http://localhost/v1/payment-terms', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: `payment-term-api-smoke-duplicate-${now}`, name: `${paymentTermName} Updated`, installments_count: 1, first_due_days: 0, interval_days: 0 }),
    }));
    expect(duplicateResponse.status).toBe(422);
    const duplicate = await duplicateResponse.json() as { code: string };
    expect(duplicate.code).toBe('DUPLICATE_PAYMENT_TERM');
  });

  it('exercises Customer Commercial Profile default price table against real postgres', async () => {
    process.env.APP_TENANT_ID = tenantId;
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
      customerRepository: new PostgresCustomerRepository(db),
      customerCommercialProfileRepository: new PostgresCustomerCommercialProfileRepository(db),
      priceTableRepository: new PostgresPriceTableRepository(db),
      paymentTermRepository: new PostgresPaymentTermRepository(db),
    });
    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-customer-profile-api-${now}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };
    const customerId = `customer-profile-api-smoke-${now}`;
    const priceTableId = `price-table-profile-api-smoke-${now}`;
    const paymentTermId = `payment-term-profile-api-smoke-${now}`;
    const representedId = `represented-profile-api-smoke-${now}`;
    const representedPriceTableId = `price-table-profile-represented-api-smoke-${now}`;

    const customerResponse = await api(new Request('http://localhost/v1/customers', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: customerId, legal_name: `Customer Profile Smoke ${now}`, document_type: 'cnpj', document_number: `DOC-PROFILE-${now}` }),
    }));
    expect(customerResponse.status).toBe(201);

    const priceTableResponse = await api(new Request('http://localhost/v1/price-tables', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: priceTableId, name: `Price Table Profile Smoke ${now}`, valid_from: '2026-01-01' }),
    }));
    expect(priceTableResponse.status).toBe(201);

    const paymentTermResponse = await api(new Request('http://localhost/v1/payment-terms', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: paymentTermId, name: `Payment Term Profile Smoke ${now}`, installments_count: 2, first_due_days: 30, interval_days: 30 }),
    }));
    expect(paymentTermResponse.status).toBe(201);

    const getEmpty = await api(new Request(`http://localhost/v1/customers/${customerId}/commercial-profile`, { headers }));
    expect(getEmpty.status).toBe(200);
    await expect(getEmpty.json()).resolves.toMatchObject({ customerId, defaultPriceTableId: null, defaultPaymentTermId: null });

    const setDefault = await api(new Request(`http://localhost/v1/customers/${customerId}/commercial-profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ default_price_table_id: priceTableId }),
    }));
    expect(setDefault.status).toBe(200);

    const profileRow = await pgClient.query(
      'SELECT tenant_id, customer_id, default_price_table_id FROM customer_commercial_profiles WHERE tenant_id = $1 AND customer_id = $2 LIMIT 1',
      [tenantId, customerId]
    );
    expect(profileRow.rows[0]).toMatchObject({ tenant_id: tenantId, customer_id: customerId, default_price_table_id: priceTableId });

    const setDefaultPaymentTerm = await api(new Request(`http://localhost/v1/customers/${customerId}/commercial-profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ default_payment_term_id: paymentTermId }),
    }));
    expect(setDefaultPaymentTerm.status).toBe(200);

    const profilePaymentTermRow = await pgClient.query(
      'SELECT tenant_id, customer_id, default_price_table_id, default_payment_term_id FROM customer_commercial_profiles WHERE tenant_id = $1 AND customer_id = $2 LIMIT 1',
      [tenantId, customerId]
    );
    expect(profilePaymentTermRow.rows[0]).toMatchObject({ tenant_id: tenantId, customer_id: customerId, default_price_table_id: priceTableId, default_payment_term_id: paymentTermId });

    const clearDefault = await api(new Request(`http://localhost/v1/customers/${customerId}/commercial-profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ default_price_table_id: null }),
    }));
    expect(clearDefault.status).toBe(200);
    await expect(clearDefault.json()).resolves.toMatchObject({ defaultPriceTableId: null });

    const clearDefaultPaymentTerm = await api(new Request(`http://localhost/v1/customers/${customerId}/commercial-profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ default_payment_term_id: null }),
    }));
    expect(clearDefaultPaymentTerm.status).toBe(200);
    await expect(clearDefaultPaymentTerm.json()).resolves.toMatchObject({ defaultPaymentTermId: null });

    await pgClient.query(
      `INSERT INTO represented_companies (id, tenant_id, name, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (tenant_id, name) DO NOTHING`,
      [representedId, tenantId, `Represented Profile Smoke ${now}`]
    );
    const representedTable = await api(new Request('http://localhost/v1/price-tables', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: representedPriceTableId, represented_company_id: representedId, name: `Price Table Profile Rep Smoke ${now}`, valid_from: '2026-01-01' }),
    }));
    expect(representedTable.status).toBe(201);

    const representedDefault = await api(new Request(`http://localhost/v1/customers/${customerId}/commercial-profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ default_price_table_id: representedPriceTableId }),
    }));
    expect(representedDefault.status).toBe(422);
  });

  it('exercises Customer Represented Commercial Profile and override model foundation against real postgres', async () => {
    process.env.APP_TENANT_ID = tenantId;
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
      customerRepository: new PostgresCustomerRepository(db),
      representedCompanyRepository: new PostgresRepresentedCompanyRepository(db),
      customerRepresentedCommercialProfileRepository: new PostgresCustomerRepresentedCommercialProfileRepository(db),
      customerProductPriceOverrideRepository: new PostgresCustomerProductPriceOverrideRepository(db),
      priceTableRepository: new PostgresPriceTableRepository(db),
      priceTableItemRepository: new PostgresPriceTableItemRepository(db),
      paymentTermRepository: new PostgresPaymentTermRepository(db),
      productRepository: new PostgresProductRepository(db),
    });
    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-rep-profile-api-${now}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };
    const customerId = `customer-rep-profile-api-smoke-${now}`;
    const representedId = `represented-rep-profile-api-smoke-${now}`;
    const priceTableId = `price-table-rep-profile-api-smoke-${now}`;
    const paymentTermId = `payment-term-rep-profile-api-smoke-${now}`;
    const productId = `product-override-api-smoke-${now}`;
    const otherRepresentedId = `represented-rep-profile-other-api-smoke-${now}`;
    const otherPriceTableId = `price-table-rep-profile-other-api-smoke-${now}`;
    const otherProductId = `product-override-other-api-smoke-${now}`;

    await pgClient.query(
      `INSERT INTO represented_companies (id, tenant_id, name, status)
       VALUES ($1, $2, $3, 'active')`,
      [representedId, tenantId, `Represented Rep Profile Smoke ${now}`]
    );
    await pgClient.query(
      `INSERT INTO represented_companies (id, tenant_id, name, status)
       VALUES ($1, $2, $3, 'active')`,
      [otherRepresentedId, tenantId, `Represented Rep Profile Other Smoke ${now}`]
    );

    const customerResponse = await api(new Request('http://localhost/v1/customers', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: customerId, legal_name: `Customer Rep Profile Smoke ${now}`, document_type: 'cnpj', document_number: `DOC-REP-PROFILE-${now}` }),
    }));
    expect(customerResponse.status).toBe(201);

    const priceTableResponse = await api(new Request('http://localhost/v1/price-tables', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: priceTableId, represented_company_id: representedId, name: `Price Table Rep Profile Smoke ${now}`, valid_from: '2026-01-01' }),
    }));
    expect(priceTableResponse.status).toBe(201);

    const paymentTermResponse = await api(new Request('http://localhost/v1/payment-terms', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: paymentTermId, name: `Payment Term Rep Profile Smoke ${now}`, installments_count: 2, first_due_days: 30, interval_days: 30 }),
    }));
    expect(paymentTermResponse.status).toBe(201);

    const getEmpty = await api(new Request(`http://localhost/v1/customers/${customerId}/represented-commercial-profiles/${representedId}`, { headers }));
    expect(getEmpty.status).toBe(200);
    await expect(getEmpty.json()).resolves.toMatchObject({ customerId, representedCompanyId: representedId, defaultPriceTableId: null, defaultPaymentTermId: null });

    const setDefaults = await api(new Request(`http://localhost/v1/customers/${customerId}/represented-commercial-profiles/${representedId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ default_price_table_id: priceTableId, default_payment_term_id: paymentTermId }),
    }));
    expect(setDefaults.status).toBe(200);

    const profileRow = await pgClient.query(
      `SELECT tenant_id, customer_id, represented_company_id, default_price_table_id, default_payment_term_id
       FROM customer_represented_commercial_profiles
       WHERE tenant_id = $1 AND customer_id = $2 AND represented_company_id = $3
       LIMIT 1`,
      [tenantId, customerId, representedId]
    );
    expect(profileRow.rows[0]).toMatchObject({ tenant_id: tenantId, customer_id: customerId, represented_company_id: representedId, default_price_table_id: priceTableId, default_payment_term_id: paymentTermId });

    await pgClient.query(
      `INSERT INTO price_tables (id, tenant_id, represented_company_id, name, currency, valid_from, status)
       VALUES ($1, $2, $3, $4, 'BRL', '2026-01-01', 'active')`,
      [otherPriceTableId, tenantId, otherRepresentedId, `Other Rep Price Table Smoke ${now}`]
    );
    await expectPgError(
      pgClient.query(
        `UPDATE customer_represented_commercial_profiles
            SET default_price_table_id = $4
          WHERE tenant_id = $1 AND customer_id = $2 AND represented_company_id = $3`,
        [tenantId, customerId, representedId, otherPriceTableId]
      ),
      '23514'
    );

    const productResponse = await api(new Request('http://localhost/v1/products', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: productId, represented_company_id: representedId, sku: `SKU-OVERRIDE-SMOKE-${now}`, name: `Override Product Smoke ${now}` }),
    }));
    expect(productResponse.status).toBe(201);

    const priceTableItemResponse = await api(new Request(`http://localhost/v1/price-tables/${priceTableId}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: `price-table-item-override-smoke-${now}`, product_id: productId, unit_price: 150, valid_from: '2026-01-01' }),
    }));
    expect(priceTableItemResponse.status).toBe(201);

    const fallbackResolution = await api(new Request(`http://localhost/v1/customers/${customerId}/represented-commercial-profiles/${representedId}/products/${productId}/resolved-price?on_date=2026-06-01`, { headers }));
    expect(fallbackResolution.status).toBe(200);
    await expect(fallbackResolution.json()).resolves.toMatchObject({ source: 'PRICE_TABLE_ITEM', unitPrice: 150 });

    const otherProductResponse = await api(new Request('http://localhost/v1/products', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: otherProductId, represented_company_id: otherRepresentedId, sku: `SKU-OVERRIDE-OTHER-SMOKE-${now}`, name: `Override Other Product Smoke ${now}` }),
    }));
    expect(otherProductResponse.status).toBe(201);

    const overrideCreate = await api(new Request(`http://localhost/v1/customers/${customerId}/represented-commercial-profiles/${representedId}/product-price-overrides`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: `override-smoke-${now}`, product_id: productId, unit_price: 123.45, valid_from: '2026-01-01' }),
    }));
    expect(overrideCreate.status).toBe(201);

    const overrideResolution = await api(new Request(`http://localhost/v1/customers/${customerId}/represented-commercial-profiles/${representedId}/products/${productId}/resolved-price?on_date=2026-06-01`, { headers }));
    expect(overrideResolution.status).toBe(200);
    await expect(overrideResolution.json()).resolves.toMatchObject({ source: 'CUSTOMER_PRODUCT_OVERRIDE', unitPrice: 123.45, sourceId: `override-smoke-${now}` });

    const quoteIdForItemSnapshot = `quote-item-snapshot-smoke-${now}`;
    const createQuoteForItem = await api(new Request('http://localhost/v0/quotes', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: quoteIdForItemSnapshot, representedCompanyId: representedId, customerId, ownerId: `owner-item-snapshot-${now}`, representativeId: `rep-item-snapshot-${now}`, numberSequence: baseSequence + 30 }),
    }));
    expect(createQuoteForItem.status).toBe(201);

    const addQuoteItem = await api(new Request(`http://localhost/v0/quotes/${quoteIdForItemSnapshot}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        priced_at: '2026-06-01',
        addItems: [{ id: `quote-item-snapshot-line-${now}`, productId, sku: `SKU-OVERRIDE-SMOKE-${now}`, description: `Override Product Smoke ${now}`, quantity: 2, unitPrice: 999 }],
      }),
    }));
    expect(addQuoteItem.status).toBe(200);
    await expect(addQuoteItem.json()).resolves.toMatchObject({ totals: { total: 246.9 } });

    const quoteItemSnapshotRow = await pgClient.query(
      `SELECT items, totals FROM commercial_documents WHERE tenant_id = $1 AND id = $2 AND document_type = 'quote' LIMIT 1`,
      [tenantId, quoteIdForItemSnapshot]
    );
    expect(quoteItemSnapshotRow.rowCount).toBe(1);
    expect(quoteItemSnapshotRow.rows[0]?.items[0]).toMatchObject({ productId, representedCompanyId: representedId, unitPrice: 123.45, lineTotal: 246.9, priceSource: 'CUSTOMER_PRODUCT_OVERRIDE', priceSourceId: `override-smoke-${now}`, priceResolvedAt: '2026-06-01' });
    expect(Number(quoteItemSnapshotRow.rows[0]?.totals.total)).toBe(246.9);

    const quotePaymentSnapshot = await api(new Request(`http://localhost/v0/quotes/${quoteIdForItemSnapshot}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ payment_term_id: paymentTermId, payment_scheduled_at: '2026-06-01' }),
    }));
    expect(quotePaymentSnapshot.status).toBe(200);
    await expect(quotePaymentSnapshot.json()).resolves.toMatchObject({
      paymentTermId,
      paymentTermSnapshot: { id: paymentTermId, installmentsCount: 2, firstDueDays: 30, intervalDays: 30, snapshottedAt: '2026-06-01' },
      paymentSchedule: [
        { installmentNumber: 1, dueDate: '2026-07-01', amount: 123.45 },
        { installmentNumber: 2, dueDate: '2026-07-31', amount: 123.45 },
      ],
    });

    const confirmPaymentSnapshot = await api(new Request(`http://localhost/v0/quotes/${quoteIdForItemSnapshot}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderSequence: baseSequence + 31 }),
    }));
    expect(confirmPaymentSnapshot.status).toBe(200);
    await expect(confirmPaymentSnapshot.json()).resolves.toMatchObject({
      documentType: 'order',
      paymentTermId,
      paymentTermSnapshot: { id: paymentTermId, installmentsCount: 2 },
      sourceQuoteSnapshot: { paymentTermSnapshot: { id: paymentTermId, installmentsCount: 2 } },
    });

    const orderPaymentSnapshotRow = await pgClient.query(
      `SELECT payment_term_id, payment_term_snapshot, payment_schedule, source_quote_snapshot FROM commercial_documents WHERE tenant_id = $1 AND source_quote_id = $2 AND document_type = 'order' LIMIT 1`,
      [tenantId, quoteIdForItemSnapshot]
    );
    expect(orderPaymentSnapshotRow.rowCount).toBe(1);
    expect(orderPaymentSnapshotRow.rows[0]).toMatchObject({ payment_term_id: paymentTermId });
    expect(orderPaymentSnapshotRow.rows[0]?.payment_term_snapshot).toMatchObject({ id: paymentTermId, installmentsCount: 2 });
    expect(orderPaymentSnapshotRow.rows[0]?.payment_schedule).toHaveLength(2);
    expect(orderPaymentSnapshotRow.rows[0]?.source_quote_snapshot.paymentTermSnapshot).toMatchObject({ id: paymentTermId, installmentsCount: 2 });

    const overrideRow = await pgClient.query(
      'SELECT tenant_id, customer_id, represented_company_id, product_id, unit_price FROM customer_product_price_overrides WHERE tenant_id = $1 AND id = $2 LIMIT 1',
      [tenantId, `override-smoke-${now}`]
    );
    expect(overrideRow.rows[0]).toMatchObject({ tenant_id: tenantId, customer_id: customerId, represented_company_id: representedId, product_id: productId });

    const duplicateOverride = await api(new Request(`http://localhost/v1/customers/${customerId}/represented-commercial-profiles/${representedId}/product-price-overrides`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: `override-duplicate-smoke-${now}`, product_id: productId, unit_price: 120, valid_from: '2026-01-01' }),
    }));
    expect(duplicateOverride.status).toBe(409);

    await expectPgError(
      pgClient.query(
        `INSERT INTO customer_product_price_overrides (
          id, tenant_id, customer_id, represented_company_id, product_id, unit_price, valid_from, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
        [`override-invalid-price-${now}`, tenantId, customerId, representedId, productId, 0, '2026-01-01']
      ),
      '23514'
    );

    await expectPgError(
      pgClient.query(
        `INSERT INTO customer_product_price_overrides (
          id, tenant_id, customer_id, represented_company_id, product_id, unit_price, valid_from, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
        [`override-mismatched-product-${now}`, tenantId, customerId, representedId, otherProductId, 10, '2026-01-01']
      ),
      '23514'
    );
  });

  it('exercises Price Table Items API against real postgres', async () => {
    process.env.APP_TENANT_ID = tenantId;
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
      customerRepository: new PostgresCustomerRepository(db),
      productRepository: new PostgresProductRepository(db),
      priceTableRepository: new PostgresPriceTableRepository(db),
      priceTableItemRepository: new PostgresPriceTableItemRepository(db),
    });
    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-price-table-item-api-${now}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };
    const productId = `product-item-api-smoke-${now}`;
    const priceTableId = `price-table-item-api-smoke-${now}`;
    const itemId = `price-table-item-api-smoke-${now}`;

    const productResponse = await api(new Request('http://localhost/v1/products', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: productId, sku: `SKU-ITEM-SMOKE-${now}`, name: `Product Item Smoke ${now}` }),
    }));
    expect(productResponse.status).toBe(201);

    const priceTableResponse = await api(new Request('http://localhost/v1/price-tables', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: priceTableId, name: `Price Table Item Smoke ${now}`, valid_from: '2026-01-01', valid_until: '2026-12-31' }),
    }));
    expect(priceTableResponse.status).toBe(201);

    const createItemResponse = await api(new Request(`http://localhost/v1/price-tables/${priceTableId}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: itemId, product_id: productId, unit_price: 10.25, valid_from: '2026-01-01', valid_until: '2026-06-30' }),
    }));
    expect(createItemResponse.status).toBe(201);

    const itemRow = await pgClient.query(
      'SELECT id, tenant_id, price_table_id, product_id, unit_price FROM price_table_items WHERE id = $1 LIMIT 1',
      [itemId]
    );
    expect(itemRow.rowCount).toBe(1);
    expect(itemRow.rows[0]).toMatchObject({ id: itemId, tenant_id: tenantId, price_table_id: priceTableId, product_id: productId });

    const listResponse = await api(new Request(`http://localhost/v1/price-tables/${priceTableId}/items`, { headers }));
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json() as { items: Array<{ id: string }> };
    expect(list.items.some((item) => item.id === itemId)).toBe(true);

    const patchResponse = await api(new Request(`http://localhost/v1/price-tables/${priceTableId}/items/${itemId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ unit_price: 11.5, status: 'inactive' }),
    }));
    expect(patchResponse.status).toBe(200);

    const duplicateResponse = await api(new Request(`http://localhost/v1/price-tables/${priceTableId}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: `price-table-item-api-smoke-2-${now}`, product_id: productId, unit_price: 12, valid_from: '2026-02-01', valid_until: '2026-03-31' }),
    }));
    expect(duplicateResponse.status).toBe(201);
  });

  it('exercises Customer API Core against real postgres', async () => {
    process.env.APP_TENANT_ID = tenantId;
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
      customerRepository: new PostgresCustomerRepository(db),
    });
    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-customer-api-${now}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };
    const customerId = `customer-api-smoke-${now}`;
    const documentNumber = `DOC-API-SMOKE-${now}`;

    const createResponse = await api(new Request('http://localhost/v1/customers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: customerId,
        legal_name: `Customer API Smoke ${now}`,
        document_type: 'cnpj',
        document_number: documentNumber,
      }),
    }));
    expect(createResponse.status).toBe(201);

    const customerRow = await pgClient.query('SELECT id, tenant_id, status FROM customers WHERE id = $1 LIMIT 1', [customerId]);
    expect(customerRow.rowCount).toBe(1);
    expect(customerRow.rows[0]?.tenant_id).toBe(tenantId);

    const listResponse = await api(new Request(`http://localhost/v1/customers?q=${documentNumber}`, { headers }));
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json() as { items: Array<{ id: string }> };
    expect(list.items.some((item) => item.id === customerId)).toBe(true);

    const getResponse = await api(new Request(`http://localhost/v1/customers/${customerId}`, { headers }));
    expect(getResponse.status).toBe(200);

    const patchResponse = await api(new Request(`http://localhost/v1/customers/${customerId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ legal_name: `Customer API Smoke Updated ${now}`, status: 'inactive' }),
    }));
    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json() as { status: string; legalName: string };
    expect(patched.status).toBe('inactive');

    const duplicateResponse = await api(new Request('http://localhost/v1/customers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: `customer-api-smoke-duplicate-${now}`,
        legal_name: `Customer API Smoke Duplicate ${now}`,
        document_type: 'cnpj',
        document_number: documentNumber,
      }),
    }));
    expect(duplicateResponse.status).toBe(422);
    const duplicate = await duplicateResponse.json() as { code: string };
    expect(duplicate.code).toBe('DUPLICATE_CUSTOMER_DOCUMENT');
  });

  it('exercises Customer Contacts + Addresses API foundation against real postgres', async () => {
    process.env.APP_TENANT_ID = tenantId;
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
      customerRepository: new PostgresCustomerRepository(db),
      customerContactRepository: new PostgresCustomerContactRepository(db),
      customerAddressRepository: new PostgresCustomerAddressRepository(db),
    });
    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-customer-child-api-${now}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    };
    const customerId = `customer-child-api-smoke-${now}`;

    await pgClient.query(
      `INSERT INTO customers (id, tenant_id, legal_name, document_type, document_number, status, owner_id, representative_id)
       VALUES ($1, $2, $3, 'cnpj', $4, 'active', $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [customerId, tenantId, `Customer Child API Smoke ${now}`, `DOC-CHILD-API-SMOKE-${now}`, headers['x-actor-id']]
    );

    const createContact = await api(new Request(`http://localhost/v1/customers/${customerId}/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: `contact-api-smoke-${now}`, name: 'Contato Smoke', email: 'smoke@example.com', is_primary: true }),
    }));
    expect(createContact.status).toBe(201);

    const listContacts = await api(new Request(`http://localhost/v1/customers/${customerId}/contacts`, { headers }));
    expect(listContacts.status).toBe(200);
    const contacts = await listContacts.json() as { items: Array<{ id: string; isPrimary: boolean }> };
    expect(contacts.items.some((item) => item.id === `contact-api-smoke-${now}` && item.isPrimary)).toBe(true);

    const patchContact = await api(new Request(`http://localhost/v1/customers/${customerId}/contacts/contact-api-smoke-${now}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ phone: '11999999999' }),
    }));
    expect(patchContact.status).toBe(200);

    const createAddress = await api(new Request(`http://localhost/v1/customers/${customerId}/addresses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: `address-api-smoke-${now}`, street: 'Rua Smoke', city: 'São Paulo', state: 'SP', is_primary: true }),
    }));
    expect(createAddress.status).toBe(201);

    const listAddresses = await api(new Request(`http://localhost/v1/customers/${customerId}/addresses`, { headers }));
    expect(listAddresses.status).toBe(200);
    const addresses = await listAddresses.json() as { items: Array<{ id: string; country: string; isPrimary: boolean }> };
    expect(addresses.items.some((item) => item.id === `address-api-smoke-${now}` && item.country === 'BR' && item.isPrimary)).toBe(true);

    const patchAddress = await api(new Request(`http://localhost/v1/customers/${customerId}/addresses/address-api-smoke-${now}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ number: '100' }),
    }));
    expect(patchAddress.status).toBe(200);
  });

  it('validates represented companies nullable foundation', async () => {
    const otherTenantId = `tenant-represented-other-${now}`;
    const representedCompanyId = `represented-smoke-${now}`;
    const otherRepresentedCompanyId = `represented-other-${now}`;

    await pgClient.query('INSERT INTO tenants (id, name, status) VALUES ($1, $2, $3)', [
      otherTenantId,
      `Represented Other Tenant ${now}`,
      'active',
    ]);

    await pgClient.query(
      'INSERT INTO represented_companies (id, tenant_id, name, status) VALUES ($1, $2, $3, $4)',
      [representedCompanyId, tenantId, `Represented Smoke ${now}`, 'active']
    );
    await pgClient.query(
      'INSERT INTO represented_companies (id, tenant_id, name, status) VALUES ($1, $2, $3, $4)',
      [otherRepresentedCompanyId, otherTenantId, `Other Represented Smoke ${now}`, 'active']
    );

    const representedCompanyColumn = await pgClient.query(
      `SELECT is_nullable
       FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2`,
      ['commercial_documents', 'represented_company_id']
    );
    expect(representedCompanyColumn.rows[0]?.is_nullable).toBe('YES');

    await pgClient.query(
      `INSERT INTO commercial_documents (
        id, document_type, number, tenant_id, represented_company_id, customer_id, owner_id, representative_id, status,
        items, totals, created_at, updated_at
      ) VALUES (
        $1, 'quote', $2, $3, $4, $5, $6, $7, 'QUOTE_DRAFT',
        $8::jsonb, $9::jsonb, now(), now()
      )`,
      [
        `q-represented-direct-${now}`,
        `ORC-${baseSequence + 3}`,
        tenantId,
        representedCompanyId,
        `customer-represented-${now}`,
        `owner-represented-${now}`,
        `rep-represented-${now}`,
        JSON.stringify([]),
        JSON.stringify({ subtotal: 0, discountTotal: 0, grandTotal: 0 }),
      ]
    );

    await pgClient.query(
      `INSERT INTO commercial_documents (
        id, document_type, number, tenant_id, represented_company_id, customer_id, owner_id, representative_id, status,
        items, totals, created_at, updated_at
      ) VALUES (
        $1, 'quote', $2, $3, NULL, $4, $5, $6, 'QUOTE_DRAFT',
        $7::jsonb, $8::jsonb, now(), now()
      )`,
      [
        `q-represented-null-${now}`,
        `ORC-${baseSequence + 4}`,
        tenantId,
        `customer-represented-null-${now}`,
        `owner-represented-null-${now}`,
        `rep-represented-null-${now}`,
        JSON.stringify([]),
        JSON.stringify({ subtotal: 0, discountTotal: 0, grandTotal: 0 }),
      ]
    );

    await expectPgError(
      pgClient.query(
        `INSERT INTO commercial_documents (
          id, document_type, number, tenant_id, represented_company_id, customer_id, owner_id, representative_id, status,
          items, totals, created_at, updated_at
        ) VALUES (
          $1, 'quote', $2, $3, $4, $5, $6, $7, 'QUOTE_DRAFT',
          $8::jsonb, $9::jsonb, now(), now()
        )`,
        [
          `q-represented-missing-${now}`,
          `ORC-${baseSequence + 5}`,
          tenantId,
          `represented-missing-${now}`,
          `customer-represented-missing-${now}`,
          `owner-represented-missing-${now}`,
          `rep-represented-missing-${now}`,
          JSON.stringify([]),
          JSON.stringify({ subtotal: 0, discountTotal: 0, grandTotal: 0 }),
        ]
      ),
      '23503'
    );

    await expectPgError(
      pgClient.query(
        `INSERT INTO commercial_documents (
          id, document_type, number, tenant_id, represented_company_id, customer_id, owner_id, representative_id, status,
          items, totals, created_at, updated_at
        ) VALUES (
          $1, 'quote', $2, $3, $4, $5, $6, $7, 'QUOTE_DRAFT',
          $8::jsonb, $9::jsonb, now(), now()
        )`,
        [
          `q-represented-cross-tenant-${now}`,
          `ORC-${baseSequence + 6}`,
          otherTenantId,
          representedCompanyId,
          `customer-represented-cross-${now}`,
          `owner-represented-cross-${now}`,
          `rep-represented-cross-${now}`,
          JSON.stringify([]),
          JSON.stringify({ subtotal: 0, discountTotal: 0, grandTotal: 0 }),
        ]
      ),
      '23503'
    );

    process.env.APP_TENANT_ID = tenantId;
    await pgClient.query(
      `INSERT INTO customers (id, tenant_id, legal_name, document_type, document_number, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [`customer-represented-api-${now}`, tenantId, `Represented API Customer ${now}`, 'cnpj', `DOC-REP-API-${now}`]
    );
    const api = createMinimalHttpApi({
      quoteRepository: new PostgresQuoteRepository(db),
      orderRepository: new PostgresOrderRepository(db),
      customerRepository: new PostgresCustomerRepository(db),
    });
    const headers = {
      'x-actor-role': 'ADMIN',
      'x-actor-id': `admin-represented-${now}`,
      'content-type': 'application/json',
    };

    const createResponse = await api(new Request('http://localhost/v0/quotes', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: `q-represented-api-${now}`,
        representedCompanyId,
        customerId: `customer-represented-api-${now}`,
        numberSequence: baseSequence + 7,
      }),
    }));
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { representedCompanyId?: string };
    expect(created.representedCompanyId).toBe(representedCompanyId);

    const confirmResponse = await api(new Request(`http://localhost/v0/quotes/q-represented-api-${now}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderSequence: baseSequence + 8 }),
    }));
    expect(confirmResponse.status).toBe(200);

    const orderRow = await pgClient.query(
      `SELECT represented_company_id, source_quote_snapshot
       FROM commercial_documents
       WHERE source_quote_id = $1 AND document_type = 'order'
       LIMIT 1`,
      [`q-represented-api-${now}`]
    );
    expect(orderRow.rows[0]?.represented_company_id).toBe(representedCompanyId);
    expect(orderRow.rows[0]?.source_quote_snapshot?.represented_company_id).toBe(representedCompanyId);
  });
});
