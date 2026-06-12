import type { QueryResultRow } from 'pg';
import type {
  CustomerRepresentedCommercialProfileGetInput,
  CustomerRepresentedCommercialProfileRecord,
  CustomerRepresentedCommercialProfileRepository,
  CustomerRepresentedCommercialProfileUpsertInput,
} from '../../application/ports/customerRepresentedCommercialProfileRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface CustomerRepresentedCommercialProfileRow extends QueryResultRow {
  tenant_id: string;
  customer_id: string;
  represented_company_id: string;
  default_price_table_id: string | null;
  default_payment_term_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresCustomerRepresentedCommercialProfileRepository implements CustomerRepresentedCommercialProfileRepository {
  constructor(private readonly db: SqlExecutor) {}

  async getByCustomerAndRepresented(input: CustomerRepresentedCommercialProfileGetInput): Promise<CustomerRepresentedCommercialProfileRecord | null> {
    const result = await this.db.query<CustomerRepresentedCommercialProfileRow>(
      `SELECT ${selectColumns()}
       FROM customer_represented_commercial_profiles
       WHERE tenant_id = $1 AND customer_id = $2 AND represented_company_id = $3
       LIMIT 1`,
      [input.tenantId, input.customerId, input.representedCompanyId]
    );
    return result.rows[0] ? rowToProfile(result.rows[0]) : null;
  }

  async upsertDefaults(input: CustomerRepresentedCommercialProfileUpsertInput): Promise<CustomerRepresentedCommercialProfileRecord> {
    const now = input.now ?? new Date();
    const result = await this.db.query<CustomerRepresentedCommercialProfileRow>(
      `INSERT INTO customer_represented_commercial_profiles (
        tenant_id, customer_id, represented_company_id, default_price_table_id, default_payment_term_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $8, $8
      ) ON CONFLICT (tenant_id, customer_id, represented_company_id) DO UPDATE SET
        default_price_table_id = CASE
          WHEN $6::boolean THEN EXCLUDED.default_price_table_id
          ELSE customer_represented_commercial_profiles.default_price_table_id
        END,
        default_payment_term_id = CASE
          WHEN $7::boolean THEN EXCLUDED.default_payment_term_id
          ELSE customer_represented_commercial_profiles.default_payment_term_id
        END,
        updated_at = EXCLUDED.updated_at
      RETURNING ${selectColumns()}`,
      [
        input.tenantId,
        input.customerId,
        input.representedCompanyId,
        input.defaultPriceTableId ?? null,
        input.defaultPaymentTermId ?? null,
        input.defaultPriceTableId !== undefined,
        input.defaultPaymentTermId !== undefined,
        now,
      ]
    );
    return rowToProfile(result.rows[0]);
  }
}

function selectColumns(): string {
  return 'tenant_id, customer_id, represented_company_id, default_price_table_id, default_payment_term_id, created_at, updated_at';
}

function rowToProfile(row: CustomerRepresentedCommercialProfileRow): CustomerRepresentedCommercialProfileRecord {
  return {
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    representedCompanyId: row.represented_company_id,
    defaultPriceTableId: row.default_price_table_id ?? undefined,
    defaultPaymentTermId: row.default_payment_term_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
