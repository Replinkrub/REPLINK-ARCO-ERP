import type { QueryResultRow } from 'pg';
import type { RepresentedCompanyRecord, RepresentedCompanyRepository, RepresentedCompanyStatus } from '../../application/ports/representedCompanyRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface RepresentedCompanyRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  name: string;
  status: RepresentedCompanyStatus;
  created_at: Date;
  updated_at: Date;
}

export class PostgresRepresentedCompanyRepository implements RepresentedCompanyRepository {
  constructor(private readonly db: SqlExecutor) {}

  async getById(input: { tenantId: string; representedCompanyId: string }): Promise<RepresentedCompanyRecord | null> {
    const result = await this.db.query<RepresentedCompanyRow>(
      `SELECT id, tenant_id, name, status, created_at, updated_at
       FROM represented_companies
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [input.tenantId, input.representedCompanyId]
    );
    return result.rows[0] ? rowToRepresentedCompany(result.rows[0]) : null;
  }
}

function rowToRepresentedCompany(row: RepresentedCompanyRow): RepresentedCompanyRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
