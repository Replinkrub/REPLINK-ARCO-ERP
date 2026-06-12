import type { QueryResultRow } from 'pg';
import type {
  PaymentTermCreateInput,
  PaymentTermListInput,
  PaymentTermListResult,
  PaymentTermRecord,
  PaymentTermRepository,
  PaymentTermStatus,
  PaymentTermUpdateInput,
  PaymentTermVisibilityScope,
} from '../../application/ports/paymentTermRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface PaymentTermRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  installments_count: number;
  first_due_days: number;
  interval_days: number;
  status: PaymentTermStatus;
  created_at: Date;
  updated_at: Date;
  total_count?: string;
}

export class PostgresPaymentTermRepository implements PaymentTermRepository {
  constructor(private readonly db: SqlExecutor) {}

  async list(input: PaymentTermListInput): Promise<PaymentTermListResult> {
    const values: unknown[] = [input.tenantId];
    let searchSql = '';
    if (input.q) {
      values.push(`%${input.q}%`);
      searchSql = ` AND name ILIKE $${values.length}`;
    }
    values.push(input.pageSize, (input.page - 1) * input.pageSize);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;
    const result = await this.db.query<PaymentTermRow>(
      `SELECT ${selectColumns()}, COUNT(*) OVER()::text AS total_count
       FROM payment_terms
       WHERE tenant_id = $1${searchSql}
       ORDER BY updated_at DESC, id ASC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      values
    );
    return { items: result.rows.map(rowToPaymentTerm), page: input.page, pageSize: input.pageSize, total: Number(result.rows[0]?.total_count ?? 0) };
  }

  async getById(input: PaymentTermVisibilityScope & { paymentTermId: string }): Promise<PaymentTermRecord | null> {
    const result = await this.db.query<PaymentTermRow>(
      `SELECT ${selectColumns()} FROM payment_terms WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [input.tenantId, input.paymentTermId]
    );
    return result.rows[0] ? rowToPaymentTerm(result.rows[0]) : null;
  }

  async create(input: PaymentTermCreateInput): Promise<PaymentTermRecord> {
    const now = input.now ?? new Date();
    const result = await this.db.query<PaymentTermRow>(
      `INSERT INTO payment_terms (
        id, tenant_id, name, description, installments_count, first_due_days, interval_days, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $9
      ) RETURNING ${selectColumns()}`,
      [input.id, input.tenantId, input.name, input.description ?? null, input.installmentsCount, input.firstDueDays, input.intervalDays, input.status, now]
    );
    return rowToPaymentTerm(result.rows[0]);
  }

  async update(input: PaymentTermUpdateInput): Promise<PaymentTermRecord | null> {
    const current = await this.getById({ tenantId: input.tenantId, actorId: input.actorId, role: input.role, paymentTermId: input.paymentTermId });
    if (!current) return null;
    const now = input.now ?? new Date();
    const result = await this.db.query<PaymentTermRow>(
      `UPDATE payment_terms SET
        name = $3,
        description = $4,
        installments_count = $5,
        first_due_days = $6,
        interval_days = $7,
        status = $8,
        updated_at = $9
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${selectColumns()}`,
      [
        input.tenantId,
        input.paymentTermId,
        input.patch.name ?? current.name,
        input.patch.description ?? current.description ?? null,
        input.patch.installmentsCount ?? current.installmentsCount,
        input.patch.firstDueDays ?? current.firstDueDays,
        input.patch.intervalDays ?? current.intervalDays,
        input.patch.status ?? current.status,
        now,
      ]
    );
    return result.rows[0] ? rowToPaymentTerm(result.rows[0]) : null;
  }
}

function selectColumns(): string {
  return 'id, tenant_id, name, description, installments_count, first_due_days, interval_days, status, created_at, updated_at';
}

function rowToPaymentTerm(row: PaymentTermRow): PaymentTermRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    installmentsCount: Number(row.installments_count),
    firstDueDays: Number(row.first_due_days),
    intervalDays: Number(row.interval_days),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
