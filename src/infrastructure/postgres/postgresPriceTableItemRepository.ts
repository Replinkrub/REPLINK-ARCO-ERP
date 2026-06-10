import type { QueryResultRow } from 'pg';
import type {
  PriceTableItemCreateInput,
  PriceTableItemListInput,
  PriceTableItemListResult,
  PriceTableItemOverlapInput,
  PriceTableItemRecord,
  PriceTableItemRepository,
  PriceTableItemStatus,
  PriceTableItemUpdateInput,
  PriceTableItemVisibilityScope,
} from '../../application/ports/priceTableItemRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface PriceTableItemRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  price_table_id: string;
  product_id: string;
  unit_price: string;
  valid_from: string | Date;
  valid_until: string | Date | null;
  status: PriceTableItemStatus;
  created_at: Date;
  updated_at: Date;
  total_count?: string;
}

export class PostgresPriceTableItemRepository implements PriceTableItemRepository {
  constructor(private readonly db: SqlExecutor) {}

  async listByPriceTable(input: PriceTableItemListInput): Promise<PriceTableItemListResult> {
    const result = await this.db.query<PriceTableItemRow>(
      `SELECT ${selectColumns()}, COUNT(*) OVER()::text AS total_count
       FROM price_table_items
       WHERE tenant_id = $1 AND price_table_id = $2
       ORDER BY updated_at DESC, id ASC
       LIMIT $3 OFFSET $4`,
      [input.tenantId, input.priceTableId, input.pageSize, (input.page - 1) * input.pageSize]
    );
    return { items: result.rows.map(rowToPriceTableItem), page: input.page, pageSize: input.pageSize, total: Number(result.rows[0]?.total_count ?? 0) };
  }

  async getById(input: PriceTableItemVisibilityScope & { priceTableId: string; itemId: string }): Promise<PriceTableItemRecord | null> {
    const result = await this.db.query<PriceTableItemRow>(
      `SELECT ${selectColumns()} FROM price_table_items WHERE tenant_id = $1 AND price_table_id = $2 AND id = $3 LIMIT 1`,
      [input.tenantId, input.priceTableId, input.itemId]
    );
    return result.rows[0] ? rowToPriceTableItem(result.rows[0]) : null;
  }

  async create(input: PriceTableItemCreateInput): Promise<PriceTableItemRecord> {
    const now = input.now ?? new Date();
    const result = await this.db.query<PriceTableItemRow>(
      `INSERT INTO price_table_items (
        id, tenant_id, price_table_id, product_id, unit_price, valid_from, valid_until, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $9
      ) RETURNING ${selectColumns()}`,
      [input.id, input.tenantId, input.priceTableId, input.productId, input.unitPrice, input.validFrom, input.validUntil ?? null, input.status, now]
    );
    return rowToPriceTableItem(result.rows[0]);
  }

  async update(input: PriceTableItemUpdateInput): Promise<PriceTableItemRecord | null> {
    const current = await this.getById({ tenantId: input.tenantId, actorId: input.actorId, role: input.role, priceTableId: input.priceTableId, itemId: input.itemId });
    if (!current) return null;
    const now = input.now ?? new Date();
    const result = await this.db.query<PriceTableItemRow>(
      `UPDATE price_table_items SET
        product_id = $4,
        unit_price = $5,
        valid_from = $6,
        valid_until = $7,
        status = $8,
        updated_at = $9
       WHERE tenant_id = $1 AND price_table_id = $2 AND id = $3
       RETURNING ${selectColumns()}`,
      [
        input.tenantId,
        input.priceTableId,
        input.itemId,
        input.patch.productId ?? current.productId,
        input.patch.unitPrice ?? current.unitPrice,
        input.patch.validFrom ?? current.validFrom,
        input.patch.validUntil ?? current.validUntil ?? null,
        input.patch.status ?? current.status,
        now,
      ]
    );
    return result.rows[0] ? rowToPriceTableItem(result.rows[0]) : null;
  }

  async hasActiveOverlap(input: PriceTableItemOverlapInput): Promise<boolean> {
    const values: unknown[] = [input.tenantId, input.priceTableId, input.productId, input.validFrom, input.validUntil ?? null];
    let ignoreSql = '';
    if (input.ignoreItemId) {
      values.push(input.ignoreItemId);
      ignoreSql = ` AND id <> $${values.length}`;
    }
    const result = await this.db.query<{ exists: boolean } & QueryResultRow>(
      `SELECT EXISTS (
        SELECT 1 FROM price_table_items
        WHERE tenant_id = $1
          AND price_table_id = $2
          AND product_id = $3
          AND status = 'active'
          AND $4::date <= COALESCE(valid_until, DATE '9999-12-31')
          AND valid_from <= COALESCE($5::date, DATE '9999-12-31')
          ${ignoreSql}
      ) AS exists`,
      values
    );
    return Boolean(result.rows[0]?.exists);
  }
}

function selectColumns(): string {
  return 'id, tenant_id, price_table_id, product_id, unit_price, valid_from, valid_until, status, created_at, updated_at';
}

function rowToPriceTableItem(row: PriceTableItemRow): PriceTableItemRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    priceTableId: row.price_table_id,
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
