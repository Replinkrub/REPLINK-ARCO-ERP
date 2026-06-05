import type { OrderRepository, SaveOrderFromQuoteResult } from '../../application/ports/orderRepository.js';
import type { CommercialDocument } from '../../domain/commercialDocument.js';
import { deserializeDocument, serializeDocument, type PersistedCommercialDocumentRow } from './documentPersistence.js';
import type { SqlExecutor } from './postgresClient.js';

export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly db: SqlExecutor) {}

  async save(order: CommercialDocument): Promise<void> {
    if (order.documentType !== 'order') {
      throw new Error('ORDER_REPOSITORY_ONLY_ACCEPTS_ORDERS');
    }
    if (!order.source_quote_id) {
      throw new Error('ORDER_REPOSITORY_REQUIRES_SOURCE_QUOTE_ID');
    }

    await this.insertOrder(order, true);
  }

  async saveFromQuoteOnce(order: CommercialDocument): Promise<SaveOrderFromQuoteResult> {
    if (order.documentType !== 'order') throw new Error('ORDER_REPOSITORY_ONLY_ACCEPTS_ORDERS');
    if (!order.source_quote_id) throw new Error('ORDER_REPOSITORY_REQUIRES_SOURCE_QUOTE_ID');

    try {
      await this.insertOrder(order, false);
      return { ok: true };
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as { code?: string }).code === '23505') {
        return { ok: false };
      }
      throw error;
    }
  }

  private async insertOrder(order: CommercialDocument, upsertById: boolean): Promise<void> {
    const row = serializeDocument(order);
    const conflictClause = upsertById
      ? `
      ON CONFLICT (id) DO UPDATE SET
        document_type = EXCLUDED.document_type,
        number = EXCLUDED.number,
        tenant_id = EXCLUDED.tenant_id,
        represented_company_id = EXCLUDED.represented_company_id,
        customer_id = EXCLUDED.customer_id,
        owner_id = EXCLUDED.owner_id,
        representative_id = EXCLUDED.representative_id,
        status = EXCLUDED.status,
        items = EXCLUDED.items,
        totals = EXCLUDED.totals,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        confirmed_at = EXCLUDED.confirmed_at,
        invoiced_at = EXCLUDED.invoiced_at,
        invoice_manual_reference = EXCLUDED.invoice_manual_reference,
        source_quote_id = EXCLUDED.source_quote_id,
        source_quote_number = EXCLUDED.source_quote_number,
        source_quote_revision = EXCLUDED.source_quote_revision,
        converted_at = EXCLUDED.converted_at,
        source_quote_snapshot = EXCLUDED.source_quote_snapshot,
        canceled_at = EXCLUDED.canceled_at,
        cancel_reason = EXCLUDED.cancel_reason,
        cancel_note = EXCLUDED.cancel_note,
        lifecycle_events = EXCLUDED.lifecycle_events,
        output_events = EXCLUDED.output_events,
        order_revisions = EXCLUDED.order_revisions`
      : '';

    await this.db.query(
      `INSERT INTO commercial_documents (
        id, document_type, number, tenant_id, represented_company_id, customer_id, owner_id, representative_id, status,
        items, totals, created_at, updated_at, confirmed_at, invoiced_at, invoice_manual_reference,
        source_quote_id, source_quote_number, source_quote_revision, converted_at, source_quote_snapshot,
        canceled_at, cancel_reason, cancel_note, lifecycle_events, output_events, order_revisions
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21::jsonb,
        $22, $23, $24, $25::jsonb, $26::jsonb, $27::jsonb
      )${conflictClause}`,
      [
        row.id, row.document_type, row.number, row.tenant_id, row.represented_company_id, row.customer_id, row.owner_id, row.representative_id, row.status,
        JSON.stringify(row.items), JSON.stringify(row.totals), row.created_at, row.updated_at, row.confirmed_at, row.invoiced_at,
        row.invoice_manual_reference, row.source_quote_id, row.source_quote_number, row.source_quote_revision, row.converted_at,
        JSON.stringify(row.source_quote_snapshot), row.canceled_at, row.cancel_reason, row.cancel_note,
        JSON.stringify(row.lifecycle_events), JSON.stringify(row.output_events), JSON.stringify(row.order_revisions),
      ]
    );
  }

  async getById(id: string): Promise<CommercialDocument | null> {
    const result = await this.db.query<PersistedCommercialDocumentRow>(
      'SELECT * FROM commercial_documents WHERE id = $1 AND document_type = $2 LIMIT 1',
      [id, 'order']
    );

    if (result.rowCount === 0) return null;
    return deserializeDocument(result.rows[0]);
  }

  async getBySourceQuoteId(sourceQuoteId: string): Promise<CommercialDocument | null> {
    const result = await this.db.query<PersistedCommercialDocumentRow>(
      'SELECT * FROM commercial_documents WHERE source_quote_id = $1 AND document_type = $2 LIMIT 1',
      [sourceQuoteId, 'order']
    );

    if (result.rowCount === 0) return null;
    return deserializeDocument(result.rows[0]);
  }
}
