import type { QueryResultRow } from 'pg';
import type {
  CustomerAddressCreateInput,
  CustomerAddressRecord,
  CustomerAddressRepository,
  CustomerAddressStatus,
  CustomerAddressType,
  CustomerAddressUpdateInput,
} from '../../application/ports/customerAddressRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface TransactionalSqlExecutor extends SqlExecutor {
  withTransaction<T>(fn: (client: SqlExecutor) => Promise<T>): Promise<T>;
}

interface CustomerAddressRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  address_type: CustomerAddressType;
  zipcode: string | null;
  street: string;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string;
  state: string;
  country: string;
  is_primary: boolean;
  status: CustomerAddressStatus;
  created_at: Date;
  updated_at: Date;
}

export class PostgresCustomerAddressRepository implements CustomerAddressRepository {
  constructor(private readonly db: TransactionalSqlExecutor) {}

  async listByCustomer(input: { tenantId: string; customerId: string }): Promise<CustomerAddressRecord[]> {
    const result = await this.db.query<CustomerAddressRow>(
      `SELECT id, tenant_id, customer_id, address_type, zipcode, street, number, complement, district, city, state, country, is_primary, status, created_at, updated_at
       FROM customer_addresses
       WHERE tenant_id = $1 AND customer_id = $2
       ORDER BY is_primary DESC, updated_at DESC, id ASC`,
      [input.tenantId, input.customerId]
    );
    return result.rows.map(rowToAddress);
  }

  async create(input: CustomerAddressCreateInput): Promise<CustomerAddressRecord> {
    const now = input.now ?? new Date();
    if (input.isPrimary) {
      return this.db.withTransaction(async (client) => {
        await lockPrimaryScope(client, input.tenantId, input.customerId);
        await unsetSiblingPrimary(client, input.tenantId, input.customerId, undefined, now);
        const result = await client.query<CustomerAddressRow>(
          `INSERT INTO customer_addresses (
            id, tenant_id, customer_id, address_type, zipcode, street, number, complement, district, city, state, country, is_primary, status, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
          ) RETURNING id, tenant_id, customer_id, address_type, zipcode, street, number, complement, district, city, state, country, is_primary, status, created_at, updated_at`,
          [input.id, input.tenantId, input.customerId, input.addressType, input.zipcode ?? null, input.street, input.number ?? null, input.complement ?? null, input.district ?? null, input.city, input.state, input.country, true, input.status, now]
        );
        return rowToAddress(result.rows[0]);
      });
    }
    const result = await this.db.query<CustomerAddressRow>(
      `INSERT INTO customer_addresses (
        id, tenant_id, customer_id, address_type, zipcode, street, number, complement, district, city, state, country, is_primary, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
      ) RETURNING id, tenant_id, customer_id, address_type, zipcode, street, number, complement, district, city, state, country, is_primary, status, created_at, updated_at`,
      [input.id, input.tenantId, input.customerId, input.addressType, input.zipcode ?? null, input.street, input.number ?? null, input.complement ?? null, input.district ?? null, input.city, input.state, input.country, input.isPrimary, input.status, now]
    );
    return rowToAddress(result.rows[0]);
  }

  async getById(input: { tenantId: string; customerId: string; addressId: string }): Promise<CustomerAddressRecord | null> {
    const result = await this.db.query<CustomerAddressRow>(
      `SELECT id, tenant_id, customer_id, address_type, zipcode, street, number, complement, district, city, state, country, is_primary, status, created_at, updated_at
       FROM customer_addresses
       WHERE tenant_id = $1 AND customer_id = $2 AND id = $3
       LIMIT 1`,
      [input.tenantId, input.customerId, input.addressId]
    );
    return result.rows[0] ? rowToAddress(result.rows[0]) : null;
  }

  async update(input: CustomerAddressUpdateInput): Promise<CustomerAddressRecord | null> {
    const current = await this.getById(input);
    if (!current) return null;
    const now = input.now ?? new Date();
    if ((input.patch.isPrimary ?? current.isPrimary) === true) {
      return this.db.withTransaction(async (client) => {
        await lockPrimaryScope(client, input.tenantId, input.customerId);
        await unsetSiblingPrimary(client, input.tenantId, input.customerId, input.addressId, now);
        const result = await client.query<CustomerAddressRow>(
          `UPDATE customer_addresses SET
            address_type = $4,
            zipcode = $5,
            street = $6,
            number = $7,
            complement = $8,
            district = $9,
            city = $10,
            state = $11,
            country = $12,
            is_primary = $13,
            status = $14,
            updated_at = $15
           WHERE tenant_id = $1 AND customer_id = $2 AND id = $3
           RETURNING id, tenant_id, customer_id, address_type, zipcode, street, number, complement, district, city, state, country, is_primary, status, created_at, updated_at`,
          [
            input.tenantId,
            input.customerId,
            input.addressId,
            input.patch.addressType ?? current.addressType,
            input.patch.zipcode ?? current.zipcode ?? null,
            input.patch.street ?? current.street,
            input.patch.number ?? current.number ?? null,
            input.patch.complement ?? current.complement ?? null,
            input.patch.district ?? current.district ?? null,
            input.patch.city ?? current.city,
            input.patch.state ?? current.state,
            input.patch.country ?? current.country,
            true,
            input.patch.status ?? current.status,
            now,
          ]
        );
        return result.rows[0] ? rowToAddress(result.rows[0]) : null;
      });
    }
    const result = await this.db.query<CustomerAddressRow>(
      `UPDATE customer_addresses SET
        address_type = $4,
        zipcode = $5,
        street = $6,
        number = $7,
        complement = $8,
        district = $9,
        city = $10,
        state = $11,
        country = $12,
        is_primary = $13,
        status = $14,
        updated_at = $15
       WHERE tenant_id = $1 AND customer_id = $2 AND id = $3
       RETURNING id, tenant_id, customer_id, address_type, zipcode, street, number, complement, district, city, state, country, is_primary, status, created_at, updated_at`,
      [
        input.tenantId,
        input.customerId,
        input.addressId,
        input.patch.addressType ?? current.addressType,
        input.patch.zipcode ?? current.zipcode ?? null,
        input.patch.street ?? current.street,
        input.patch.number ?? current.number ?? null,
        input.patch.complement ?? current.complement ?? null,
        input.patch.district ?? current.district ?? null,
        input.patch.city ?? current.city,
        input.patch.state ?? current.state,
        input.patch.country ?? current.country,
        input.patch.isPrimary ?? current.isPrimary,
        input.patch.status ?? current.status,
        now,
      ]
    );
    return result.rows[0] ? rowToAddress(result.rows[0]) : null;
  }
}

async function lockPrimaryScope(db: SqlExecutor, tenantId: string, customerId: string): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${tenantId}:${customerId}`]);
}

async function unsetSiblingPrimary(db: SqlExecutor, tenantId: string, customerId: string, primaryId: string | undefined, now: Date): Promise<void> {
  if (primaryId) {
    await db.query(
      `UPDATE customer_addresses
       SET is_primary = false, updated_at = $4
       WHERE tenant_id = $1 AND customer_id = $2 AND id <> $3 AND is_primary = true`,
      [tenantId, customerId, primaryId, now]
    );
    return;
  }

  await db.query(
    `UPDATE customer_addresses
     SET is_primary = false, updated_at = $3
     WHERE tenant_id = $1 AND customer_id = $2 AND is_primary = true`,
    [tenantId, customerId, now]
  );
}

function rowToAddress(row: CustomerAddressRow): CustomerAddressRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    addressType: row.address_type,
    zipcode: row.zipcode ?? undefined,
    street: row.street,
    number: row.number ?? undefined,
    complement: row.complement ?? undefined,
    district: row.district ?? undefined,
    city: row.city,
    state: row.state,
    country: row.country,
    isPrimary: row.is_primary,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
