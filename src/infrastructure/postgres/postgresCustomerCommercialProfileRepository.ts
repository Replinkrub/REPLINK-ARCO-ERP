import type { QueryResultRow } from 'pg';
import type {
  CustomerCommercialProfileGetInput,
  CustomerCommercialProfileRecord,
  CustomerCommercialProfileRepository,
  CustomerCommercialProfileUpsertDefaultPaymentTermInput,
  CustomerCommercialProfileUpsertDefaultPriceTableInput,
} from '../../application/ports/customerCommercialProfileRepository.js';
import type { SqlExecutor } from './postgresClient.js';

interface CustomerCommercialProfileRow extends QueryResultRow {
  tenant_id: string;
  customer_id: string;
  default_payment_term_id: string | null;
  default_price_table_id: string | null;
  credit_limit: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresCustomerCommercialProfileRepository implements CustomerCommercialProfileRepository {
  constructor(private readonly db: SqlExecutor) {}

  async getByCustomer(input: CustomerCommercialProfileGetInput): Promise<CustomerCommercialProfileRecord | null> {
    const result = await this.db.query<CustomerCommercialProfileRow>(
      `SELECT ${selectColumns()} FROM customer_commercial_profiles WHERE tenant_id = $1 AND customer_id = $2 LIMIT 1`,
      [input.tenantId, input.customerId]
    );
    return result.rows[0] ? rowToProfile(result.rows[0]) : null;
  }

  async upsertDefaultPriceTable(input: CustomerCommercialProfileUpsertDefaultPriceTableInput): Promise<CustomerCommercialProfileRecord> {
    const now = input.now ?? new Date();
    const result = await this.db.query<CustomerCommercialProfileRow>(
      `INSERT INTO customer_commercial_profiles (
        tenant_id, customer_id, default_price_table_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $4
      ) ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
        default_price_table_id = EXCLUDED.default_price_table_id,
        updated_at = EXCLUDED.updated_at
      RETURNING ${selectColumns()}`,
      [input.tenantId, input.customerId, input.defaultPriceTableId, now]
    );
    return rowToProfile(result.rows[0]);
  }

  async upsertDefaultPaymentTerm(input: CustomerCommercialProfileUpsertDefaultPaymentTermInput): Promise<CustomerCommercialProfileRecord> {
    const now = input.now ?? new Date();
    const result = await this.db.query<CustomerCommercialProfileRow>(
      `INSERT INTO customer_commercial_profiles (
        tenant_id, customer_id, default_payment_term_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $4
      ) ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
        default_payment_term_id = EXCLUDED.default_payment_term_id,
        updated_at = EXCLUDED.updated_at
      RETURNING ${selectColumns()}`,
      [input.tenantId, input.customerId, input.defaultPaymentTermId, now]
    );
    return rowToProfile(result.rows[0]);
  }
}

function selectColumns(): string {
  return 'tenant_id, customer_id, default_payment_term_id, default_price_table_id, credit_limit, notes, created_at, updated_at';
}

function rowToProfile(row: CustomerCommercialProfileRow): CustomerCommercialProfileRecord {
  return {
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    defaultPaymentTermId: row.default_payment_term_id ?? undefined,
    defaultPriceTableId: row.default_price_table_id ?? undefined,
    creditLimit: row.credit_limit === null ? undefined : Number(row.credit_limit),
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
