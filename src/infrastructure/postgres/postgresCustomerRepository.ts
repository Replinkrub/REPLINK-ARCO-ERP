import type { QueryResultRow } from 'pg';
import type { CustomerRepository, CustomerStatus } from '../../application/ports/customerRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface CustomerStatusRow extends QueryResultRow {
  status: CustomerStatus;
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
}
