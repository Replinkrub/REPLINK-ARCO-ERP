import type { QueryResultRow } from 'pg';
import type {
  CustomerCreateInput,
  CustomerListInput,
  CustomerListResult,
  CustomerRecord,
  CustomerRepository,
  CustomerStatus,
  CustomerUpdateInput,
  CustomerVisibilityScope,
} from '../../application/ports/customerRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface CustomerStatusRow extends QueryResultRow {
  status: CustomerStatus;
}

interface CustomerRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  legal_name: string;
  trade_name: string | null;
  document_type: string;
  document_number: string;
  status: CustomerStatus;
  segment: string | null;
  notes: string | null;
  owner_id: string | null;
  representative_id: string | null;
  created_at: Date;
  updated_at: Date;
  total_count?: string;
}

export class PostgresCustomerRepository implements CustomerRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findStatusByTenantAndId(input: { tenantId: string; customerId: string }): Promise<CustomerStatus | null> {
    const result = await this.db.query<CustomerStatusRow>(
      'SELECT status FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1',
      [input.tenantId, input.customerId]
    );

    return result.rows[0]?.status ?? null;
  }

  async list(input: CustomerListInput): Promise<CustomerListResult> {
    const where = visibilityWhere(input, 1);
    const values: unknown[] = [input.tenantId, input.actorId];
    let searchSql = '';
    if (input.q) {
      values.push(`%${input.q}%`);
      searchSql = ` AND (legal_name ILIKE $${values.length} OR document_number ILIKE $${values.length})`;
    }
    values.push(input.pageSize, (input.page - 1) * input.pageSize);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;

    const result = await this.db.query<CustomerRow>(
      `SELECT id, tenant_id, legal_name, trade_name, document_type, document_number, status, segment, notes, owner_id, representative_id, created_at, updated_at,
        COUNT(*) OVER()::text AS total_count
       FROM customers
       WHERE ${where}${searchSql}
       ORDER BY updated_at DESC, id ASC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      values
    );

    return {
      items: result.rows.map(rowToCustomer),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(result.rows[0]?.total_count ?? 0),
    };
  }

  async getById(input: CustomerVisibilityScope & { customerId: string }): Promise<CustomerRecord | null> {
    const result = await this.db.query<CustomerRow>(
      `SELECT id, tenant_id, legal_name, trade_name, document_type, document_number, status, segment, notes, owner_id, representative_id, created_at, updated_at
       FROM customers
       WHERE ${visibilityWhere(input, 1)} AND id = $3
       LIMIT 1`,
      [input.tenantId, input.actorId, input.customerId]
    );
    return result.rows[0] ? rowToCustomer(result.rows[0]) : null;
  }

  async create(input: CustomerCreateInput): Promise<CustomerRecord> {
    const now = input.now ?? new Date();
    const result = await this.db.query<CustomerRow>(
      `INSERT INTO customers (
        id, tenant_id, legal_name, trade_name, document_type, document_number, status, segment, notes, owner_id, representative_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12
      ) RETURNING id, tenant_id, legal_name, trade_name, document_type, document_number, status, segment, notes, owner_id, representative_id, created_at, updated_at`,
      [input.id, input.tenantId, input.legalName, input.tradeName ?? null, input.documentType, input.documentNumber, input.status, input.segment ?? null, input.notes ?? null, input.ownerId ?? null, input.representativeId ?? null, now]
    );
    return rowToCustomer(result.rows[0]);
  }

  async update(input: CustomerUpdateInput): Promise<CustomerRecord | null> {
    const current = await this.getById({ tenantId: input.tenantId, actorId: input.actorId, role: input.role, customerId: input.customerId });
    if (!current) return null;
    const now = input.now ?? new Date();
    const result = await this.db.query<CustomerRow>(
      `UPDATE customers SET
        legal_name = $4,
        trade_name = $5,
        document_type = $6,
        document_number = $7,
        status = $8,
        segment = $9,
        notes = $10,
        updated_at = $11
       WHERE ${visibilityWhere(input, 1)} AND id = $3
       RETURNING id, tenant_id, legal_name, trade_name, document_type, document_number, status, segment, notes, owner_id, representative_id, created_at, updated_at`,
      [
        input.tenantId,
        input.actorId,
        input.customerId,
        input.patch.legalName ?? current.legalName,
        input.patch.tradeName ?? current.tradeName ?? null,
        input.patch.documentType ?? current.documentType,
        input.patch.documentNumber ?? current.documentNumber,
        input.patch.status ?? current.status,
        input.patch.segment ?? current.segment ?? null,
        input.patch.notes ?? current.notes ?? null,
        now,
      ]
    );
    return result.rows[0] ? rowToCustomer(result.rows[0]) : null;
  }
}

function visibilityWhere(scope: CustomerVisibilityScope, tenantParamIndex: number): string {
  if (scope.role === 'ADMIN') return `(tenant_id = $${tenantParamIndex} AND $${tenantParamIndex + 1}::text IS NOT NULL)`;
  return `(tenant_id = $${tenantParamIndex} AND (owner_id = $${tenantParamIndex + 1} OR representative_id = $${tenantParamIndex + 1}))`;
}

function rowToCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    legalName: row.legal_name,
    tradeName: row.trade_name ?? undefined,
    documentType: row.document_type,
    documentNumber: row.document_number,
    status: row.status,
    segment: row.segment ?? undefined,
    notes: row.notes ?? undefined,
    ownerId: row.owner_id ?? undefined,
    representativeId: row.representative_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
