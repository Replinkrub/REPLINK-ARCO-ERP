import type { QueryResultRow } from 'pg';
import type {
  PriceTableCreateInput,
  PriceTableListInput,
  PriceTableListResult,
  PriceTableRecord,
  PriceTableRepository,
  PriceTableStatus,
  PriceTableUpdateInput,
  PriceTableVisibilityScope,
} from '../../application/ports/priceTableRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface PriceTableRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  represented_company_id: string | null;
  name: string;
  currency: string;
  valid_from: string | Date;
  valid_until: string | Date | null;
  status: PriceTableStatus;
  created_at: Date;
  updated_at: Date;
  total_count?: string;
}

export class PostgresPriceTableRepository implements PriceTableRepository {
  constructor(private readonly db: SqlExecutor) {}

  async list(input: PriceTableListInput): Promise<PriceTableListResult> {
    const values: unknown[] = [input.tenantId];
    let searchSql = '';
    if (input.q) {
      values.push(`%${input.q}%`);
      searchSql = ` AND name ILIKE $${values.length}`;
    }
    values.push(input.pageSize, (input.page - 1) * input.pageSize);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;
    const result = await this.db.query<PriceTableRow>(
      `SELECT ${selectColumns()}, COUNT(*) OVER()::text AS total_count
       FROM price_tables
       WHERE tenant_id = $1${searchSql}
       ORDER BY updated_at DESC, id ASC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      values
    );
    return { items: result.rows.map(rowToPriceTable), page: input.page, pageSize: input.pageSize, total: Number(result.rows[0]?.total_count ?? 0) };
  }

  async getById(input: PriceTableVisibilityScope & { priceTableId: string }): Promise<PriceTableRecord | null> {
    const result = await this.db.query<PriceTableRow>(
      `SELECT ${selectColumns()} FROM price_tables WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [input.tenantId, input.priceTableId]
    );
    return result.rows[0] ? rowToPriceTable(result.rows[0]) : null;
  }

  async create(input: PriceTableCreateInput): Promise<PriceTableRecord> {
    const now = input.now ?? new Date();
    const result = await this.db.query<PriceTableRow>(
      `INSERT INTO price_tables (
        id, tenant_id, represented_company_id, name, currency, valid_from, valid_until, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $9
      ) RETURNING ${selectColumns()}`,
      [input.id, input.tenantId, input.representedCompanyId ?? null, input.name, input.currency, input.validFrom, input.validUntil ?? null, input.status, now]
    );
    return rowToPriceTable(result.rows[0]);
  }

  async update(input: PriceTableUpdateInput): Promise<PriceTableRecord | null> {
    const current = await this.getById({ tenantId: input.tenantId, actorId: input.actorId, role: input.role, priceTableId: input.priceTableId });
    if (!current) return null;
    const now = input.now ?? new Date();
    const result = await this.db.query<PriceTableRow>(
      `UPDATE price_tables SET
        represented_company_id = $3,
        name = $4,
        currency = $5,
        valid_from = $6,
        valid_until = $7,
        status = $8,
        updated_at = $9
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${selectColumns()}`,
      [
        input.tenantId,
        input.priceTableId,
        input.patch.representedCompanyId ?? current.representedCompanyId ?? null,
        input.patch.name ?? current.name,
        input.patch.currency ?? current.currency,
        input.patch.validFrom ?? current.validFrom,
        input.patch.validUntil ?? current.validUntil ?? null,
        input.patch.status ?? current.status,
        now,
      ]
    );
    return result.rows[0] ? rowToPriceTable(result.rows[0]) : null;
  }
}

function selectColumns(): string {
  return 'id, tenant_id, represented_company_id, name, currency, valid_from, valid_until, status, created_at, updated_at';
}

function rowToPriceTable(row: PriceTableRow): PriceTableRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    representedCompanyId: row.represented_company_id ?? undefined,
    name: row.name,
    currency: row.currency,
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
