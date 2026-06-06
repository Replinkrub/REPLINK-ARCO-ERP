import type { QueryResultRow } from 'pg';
import type {
  CustomerContactCreateInput,
  CustomerContactRecord,
  CustomerContactRepository,
  CustomerContactStatus,
  CustomerContactUpdateInput,
} from '../../application/ports/customerContactRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface TransactionalSqlExecutor extends SqlExecutor {
  withTransaction<T>(fn: (client: SqlExecutor) => Promise<T>): Promise<T>;
}

interface CustomerContactRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  name: string;
  role_title: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  is_primary: boolean;
  status: CustomerContactStatus;
  created_at: Date;
  updated_at: Date;
}

export class PostgresCustomerContactRepository implements CustomerContactRepository {
  constructor(private readonly db: TransactionalSqlExecutor) {}

  async listByCustomer(input: { tenantId: string; customerId: string }): Promise<CustomerContactRecord[]> {
    const result = await this.db.query<CustomerContactRow>(
      `SELECT id, tenant_id, customer_id, name, role_title, phone, whatsapp, email, is_primary, status, created_at, updated_at
       FROM customer_contacts
       WHERE tenant_id = $1 AND customer_id = $2
       ORDER BY is_primary DESC, updated_at DESC, id ASC`,
      [input.tenantId, input.customerId]
    );
    return result.rows.map(rowToContact);
  }

  async create(input: CustomerContactCreateInput): Promise<CustomerContactRecord> {
    const now = input.now ?? new Date();
    if (input.isPrimary) {
      return this.db.withTransaction(async (client) => {
        await lockPrimaryScope(client, input.tenantId, input.customerId);
        await unsetSiblingPrimary(client, input.tenantId, input.customerId, undefined, now);
        const result = await client.query<CustomerContactRow>(
          `INSERT INTO customer_contacts (
            id, tenant_id, customer_id, name, role_title, phone, whatsapp, email, is_primary, status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11
          ) RETURNING id, tenant_id, customer_id, name, role_title, phone, whatsapp, email, is_primary, status, created_at, updated_at`,
          [input.id, input.tenantId, input.customerId, input.name, input.roleTitle ?? null, input.phone ?? null, input.whatsapp ?? null, input.email ?? null, true, input.status, now]
        );
        return rowToContact(result.rows[0]);
      });
    }
    const result = await this.db.query<CustomerContactRow>(
      `INSERT INTO customer_contacts (
        id, tenant_id, customer_id, name, role_title, phone, whatsapp, email, is_primary, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11
      ) RETURNING id, tenant_id, customer_id, name, role_title, phone, whatsapp, email, is_primary, status, created_at, updated_at`,
      [input.id, input.tenantId, input.customerId, input.name, input.roleTitle ?? null, input.phone ?? null, input.whatsapp ?? null, input.email ?? null, input.isPrimary, input.status, now]
    );
    return rowToContact(result.rows[0]);
  }

  async getById(input: { tenantId: string; customerId: string; contactId: string }): Promise<CustomerContactRecord | null> {
    const result = await this.db.query<CustomerContactRow>(
      `SELECT id, tenant_id, customer_id, name, role_title, phone, whatsapp, email, is_primary, status, created_at, updated_at
       FROM customer_contacts
       WHERE tenant_id = $1 AND customer_id = $2 AND id = $3
       LIMIT 1`,
      [input.tenantId, input.customerId, input.contactId]
    );
    return result.rows[0] ? rowToContact(result.rows[0]) : null;
  }

  async update(input: CustomerContactUpdateInput): Promise<CustomerContactRecord | null> {
    const current = await this.getById(input);
    if (!current) return null;
    const now = input.now ?? new Date();
    if ((input.patch.isPrimary ?? current.isPrimary) === true) {
      return this.db.withTransaction(async (client) => {
        await lockPrimaryScope(client, input.tenantId, input.customerId);
        await unsetSiblingPrimary(client, input.tenantId, input.customerId, input.contactId, now);
        const result = await client.query<CustomerContactRow>(
          `UPDATE customer_contacts SET
            name = $4,
            role_title = $5,
            phone = $6,
            whatsapp = $7,
            email = $8,
            is_primary = $9,
            status = $10,
            updated_at = $11
           WHERE tenant_id = $1 AND customer_id = $2 AND id = $3
           RETURNING id, tenant_id, customer_id, name, role_title, phone, whatsapp, email, is_primary, status, created_at, updated_at`,
          [
            input.tenantId,
            input.customerId,
            input.contactId,
            input.patch.name ?? current.name,
            input.patch.roleTitle ?? current.roleTitle ?? null,
            input.patch.phone ?? current.phone ?? null,
            input.patch.whatsapp ?? current.whatsapp ?? null,
            input.patch.email ?? current.email ?? null,
            true,
            input.patch.status ?? current.status,
            now,
          ]
        );
        return result.rows[0] ? rowToContact(result.rows[0]) : null;
      });
    }
    const result = await this.db.query<CustomerContactRow>(
      `UPDATE customer_contacts SET
        name = $4,
        role_title = $5,
        phone = $6,
        whatsapp = $7,
        email = $8,
        is_primary = $9,
        status = $10,
        updated_at = $11
       WHERE tenant_id = $1 AND customer_id = $2 AND id = $3
       RETURNING id, tenant_id, customer_id, name, role_title, phone, whatsapp, email, is_primary, status, created_at, updated_at`,
      [
        input.tenantId,
        input.customerId,
        input.contactId,
        input.patch.name ?? current.name,
        input.patch.roleTitle ?? current.roleTitle ?? null,
        input.patch.phone ?? current.phone ?? null,
        input.patch.whatsapp ?? current.whatsapp ?? null,
        input.patch.email ?? current.email ?? null,
        input.patch.isPrimary ?? current.isPrimary,
        input.patch.status ?? current.status,
        now,
      ]
    );
    return result.rows[0] ? rowToContact(result.rows[0]) : null;
  }
}

async function lockPrimaryScope(db: SqlExecutor, tenantId: string, customerId: string): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${tenantId}:${customerId}`]);
}

async function unsetSiblingPrimary(db: SqlExecutor, tenantId: string, customerId: string, primaryId: string | undefined, now: Date): Promise<void> {
  if (primaryId) {
    await db.query(
      `UPDATE customer_contacts
       SET is_primary = false, updated_at = $4
       WHERE tenant_id = $1 AND customer_id = $2 AND id <> $3 AND is_primary = true`,
      [tenantId, customerId, primaryId, now]
    );
    return;
  }

  await db.query(
    `UPDATE customer_contacts
     SET is_primary = false, updated_at = $3
     WHERE tenant_id = $1 AND customer_id = $2 AND is_primary = true`,
    [tenantId, customerId, now]
  );
}

function rowToContact(row: CustomerContactRow): CustomerContactRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    name: row.name,
    roleTitle: row.role_title ?? undefined,
    phone: row.phone ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    email: row.email ?? undefined,
    isPrimary: row.is_primary,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
