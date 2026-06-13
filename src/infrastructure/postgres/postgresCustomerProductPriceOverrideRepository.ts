import type { QueryResultRow } from 'pg';
import type {
  CustomerProductPriceOverrideActiveInput,
  CustomerProductPriceOverrideCreateInput,
  CustomerProductPriceOverrideListInput,
  CustomerProductPriceOverrideListResult,
  CustomerProductPriceOverrideRecord,
  CustomerProductPriceOverrideRepository,
  CustomerProductPriceOverrideStatus,
  CustomerProductPriceOverrideUpdateInput,
  CustomerProductPriceOverrideVisibilityScope,
} from '../../application/ports/customerProductPriceOverrideRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface CustomerProductPriceOverrideRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  represented_company_id: string;
  product_id: string;
  unit_price: string;
  valid_from: string | Date;
  valid_until: string | Date | null;
  status: CustomerProductPriceOverrideStatus;
  created_at: Date;
  updated_at: Date;
  total_count?: string;
}

export class PostgresCustomerProductPriceOverrideRepository implements CustomerProductPriceOverrideRepository {
  constructor(private readonly db: SqlExecutor) {}

  async list(input: CustomerProductPriceOverrideListInput): Promise<CustomerProductPriceOverrideListResult> {
    const values: unknown[] = [input.tenantId, input.customerId, input.representedCompanyId];
    let productSql = '';
    if (input.productId) {
      values.push(input.productId);
      productSql = ` AND product_id = $${values.length}`;
    }
    values.push(input.pageSize, (input.page - 1) * input.pageSize);
    const result = await this.db.query<CustomerProductPriceOverrideRow>(
      `SELECT ${selectColumns()}, COUNT(*) OVER()::text AS total_count
       FROM customer_product_price_overrides
       WHERE tenant_id = $1 AND customer_id = $2 AND represented_company_id = $3${productSql}
       ORDER BY updated_at DESC, id ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    return { items: result.rows.map(rowToOverride), page: input.page, pageSize: input.pageSize, total: Number(result.rows[0]?.total_count ?? 0) };
  }

  async getById(input: CustomerProductPriceOverrideVisibilityScope & { customerId: string; representedCompanyId: string; overrideId: string }): Promise<CustomerProductPriceOverrideRecord | null> {
    const result = await this.db.query<CustomerProductPriceOverrideRow>(
      `SELECT ${selectColumns()} FROM customer_product_price_overrides
       WHERE tenant_id = $1 AND customer_id = $2 AND represented_company_id = $3 AND id = $4
       LIMIT 1`,
      [input.tenantId, input.customerId, input.representedCompanyId, input.overrideId]
    );
    return result.rows[0] ? rowToOverride(result.rows[0]) : null;
  }

  async create(input: CustomerProductPriceOverrideCreateInput): Promise<CustomerProductPriceOverrideRecord> {
    const now = input.now ?? new Date();
    const result = await this.db.query<CustomerProductPriceOverrideRow>(
      `INSERT INTO customer_product_price_overrides (
        id, tenant_id, customer_id, represented_company_id, product_id, unit_price, valid_from, valid_until, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10
      ) RETURNING ${selectColumns()}`,
      [input.id, input.tenantId, input.customerId, input.representedCompanyId, input.productId, input.unitPrice, input.validFrom, input.validUntil ?? null, input.status, now]
    );
    return rowToOverride(result.rows[0]);
  }

  async update(input: CustomerProductPriceOverrideUpdateInput): Promise<CustomerProductPriceOverrideRecord | null> {
    const current = await this.getById({ tenantId: input.tenantId, actorId: input.actorId, role: input.role, customerId: input.customerId, representedCompanyId: input.representedCompanyId, overrideId: input.overrideId });
    if (!current) return null;
    const now = input.now ?? new Date();
    const result = await this.db.query<CustomerProductPriceOverrideRow>(
      `UPDATE customer_product_price_overrides SET
        product_id = $5,
        unit_price = $6,
        valid_from = $7,
        valid_until = $8,
        status = $9,
        updated_at = $10
       WHERE tenant_id = $1 AND customer_id = $2 AND represented_company_id = $3 AND id = $4
       RETURNING ${selectColumns()}`,
      [
        input.tenantId,
        input.customerId,
        input.representedCompanyId,
        input.overrideId,
        input.patch.productId ?? current.productId,
        input.patch.unitPrice ?? current.unitPrice,
        input.patch.validFrom ?? current.validFrom,
        input.patch.validUntil ?? current.validUntil ?? null,
        input.patch.status ?? current.status,
        now,
      ]
    );
    return result.rows[0] ? rowToOverride(result.rows[0]) : null;
  }

  async findActive(input: CustomerProductPriceOverrideActiveInput): Promise<CustomerProductPriceOverrideRecord | null> {
    const result = await this.db.query<CustomerProductPriceOverrideRow>(
      `SELECT ${selectColumns()} FROM customer_product_price_overrides
       WHERE tenant_id = $1
         AND customer_id = $2
         AND represented_company_id = $3
         AND product_id = $4
         AND status = 'active'
         AND valid_from <= $5::date
         AND COALESCE(valid_until, DATE '9999-12-31') >= $5::date
       ORDER BY updated_at DESC, id ASC
       LIMIT 1`,
      [input.tenantId, input.customerId, input.representedCompanyId, input.productId, input.onDate]
    );
    return result.rows[0] ? rowToOverride(result.rows[0]) : null;
  }

  async hasActiveForScope(input: Omit<CustomerProductPriceOverrideActiveInput, 'onDate'>): Promise<boolean> {
    const values: unknown[] = [input.tenantId, input.customerId, input.representedCompanyId, input.productId];
    let ignoreSql = '';
    if (input.ignoreOverrideId) {
      values.push(input.ignoreOverrideId);
      ignoreSql = ` AND id <> $${values.length}`;
    }
    const result = await this.db.query<{ exists: boolean } & QueryResultRow>(
      `SELECT EXISTS (
        SELECT 1 FROM customer_product_price_overrides
        WHERE tenant_id = $1
          AND customer_id = $2
          AND represented_company_id = $3
          AND product_id = $4
          AND status = 'active'
          ${ignoreSql}
      ) AS exists`,
      values
    );
    return Boolean(result.rows[0]?.exists);
  }
}

function selectColumns(): string {
  return 'id, tenant_id, customer_id, represented_company_id, product_id, unit_price, valid_from, valid_until, status, created_at, updated_at';
}

function rowToOverride(row: CustomerProductPriceOverrideRow): CustomerProductPriceOverrideRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    representedCompanyId: row.represented_company_id,
    productId: row.product_id,
    unitPrice: Number(row.unit_price),
    validFrom: dateToString(row.valid_from),
    validUntil: row.valid_until === null ? undefined : dateToString(row.valid_until),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function dateToString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}
