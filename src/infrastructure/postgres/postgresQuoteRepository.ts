import type { QuoteRepository } from '../../application/ports/quoteRepository.js';
import type { CommercialDocument } from '../../domain/commercialDocument.js';
import { deserializeDocument, serializeDocument, type PersistedCommercialDocumentRow } from './documentPersistence.js';
import type { SqlExecutor } from './postgresClient.js';

export class PostgresQuoteRepository implements QuoteRepository {
  constructor(private readonly db: SqlExecutor) {}

  async save(quote: CommercialDocument): Promise<void> {
    if (quote.documentType !== 'quote') {
      throw new Error('QUOTE_REPOSITORY_ONLY_ACCEPTS_QUOTES');
    }

    const row = serializeDocument(quote);
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
      )
      ON CONFLICT (id) DO UPDATE SET
        number = EXCLUDED.number,
        represented_company_id = EXCLUDED.represented_company_id,
        customer_id = EXCLUDED.customer_id,
        status = EXCLUDED.status,
        items = EXCLUDED.items,
        totals = EXCLUDED.totals,
        updated_at = EXCLUDED.updated_at,
        canceled_at = EXCLUDED.canceled_at,
        cancel_reason = EXCLUDED.cancel_reason,
        cancel_note = EXCLUDED.cancel_note,
        lifecycle_events = EXCLUDED.lifecycle_events,
        output_events = EXCLUDED.output_events,
        order_revisions = EXCLUDED.order_revisions`,
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
      [id, 'quote']
    );

    if (result.rowCount === 0) return null;
    return deserializeDocument(result.rows[0]);
  }
}
