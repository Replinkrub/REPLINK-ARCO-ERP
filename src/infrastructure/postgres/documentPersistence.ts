import type {
  CommercialDocument,
  CommercialDocumentLifecycleEvent,
  CommercialDocumentOrderRevision,
  CommercialDocumentOutputEvent,
} from '../../domain/commercialDocument.js';

export interface PersistedCommercialDocumentRow {
  [column: string]: unknown;
  id: string;
  document_type: 'quote' | 'order';
  number: string;
  tenant_id: string;
  represented_company_id: string | null;
  customer_id: string | null;
  owner_id: string;
  representative_id: string;
  status: string;
  items: unknown;
  totals: unknown;
  created_at: Date;
  updated_at: Date;
  confirmed_at: Date | null;
  invoiced_at: Date | null;
  invoice_manual_reference: string | null;
  source_quote_id: string | null;
  source_quote_number: string | null;
  source_quote_revision: string | null;
  converted_at: Date | null;
  source_quote_snapshot: unknown;
  canceled_at: Date | null;
  cancel_reason: string | null;
  cancel_note: string | null;
  lifecycle_events: unknown;
  output_events: unknown;
  order_revisions: unknown;
}

export function serializeDocument(document: CommercialDocument): PersistedCommercialDocumentRow {
  return {
    id: document.id,
    document_type: document.documentType,
    number: document.number,
    tenant_id: document.tenantId,
    represented_company_id: document.representedCompanyId ?? null,
    customer_id: document.customerId ?? null,
    owner_id: document.ownerId,
    representative_id: document.representativeId,
    status: document.status,
    items: document.items,
    totals: document.totals,
    created_at: document.createdAt,
    updated_at: document.updatedAt,
    confirmed_at: document.confirmedAt ?? null,
    invoiced_at: document.invoicedAt ?? null,
    invoice_manual_reference: document.invoiceManualReference ?? null,
    source_quote_id: document.source_quote_id ?? null,
    source_quote_number: document.source_quote_number ?? null,
    source_quote_revision: document.source_quote_revision != null ? String(document.source_quote_revision) : null,
    converted_at: document.converted_at ?? null,
    source_quote_snapshot: document.sourceQuoteSnapshot ?? null,
    canceled_at: document.canceledAt ?? null,
    cancel_reason: document.cancelReason ?? null,
    cancel_note: document.cancelNote ?? null,
    lifecycle_events: document.lifecycleEvents,
    output_events: document.outputEvents,
    order_revisions: document.orderRevisions,
  };
}

export function deserializeDocument(row: PersistedCommercialDocumentRow): CommercialDocument {
  const sourceSnapshot = row.source_quote_snapshot as CommercialDocument['sourceQuoteSnapshot'] | null;
  return {
    id: row.id,
    documentType: row.document_type,
    number: row.number,
    tenantId: row.tenant_id,
    representedCompanyId: row.represented_company_id ?? undefined,
    customerId: row.customer_id ?? undefined,
    ownerId: row.owner_id,
    representativeId: row.representative_id,
    status: row.status as CommercialDocument['status'],
    items: structuredClone(row.items as CommercialDocument['items']),
    totals: structuredClone(row.totals as CommercialDocument['totals']),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
    invoicedAt: row.invoiced_at ? new Date(row.invoiced_at) : undefined,
    invoiceManualReference: row.invoice_manual_reference ?? undefined,
    source_quote_id: row.source_quote_id ?? undefined,
    source_quote_number: row.source_quote_number ?? undefined,
    source_quote_revision: row.source_quote_revision ?? undefined,
    converted_at: row.converted_at ? new Date(row.converted_at) : undefined,
    sourceQuoteSnapshot: sourceSnapshot
      ? {
          ...structuredClone(sourceSnapshot),
          converted_at: new Date(sourceSnapshot.converted_at),
        }
      : undefined,
    canceledAt: row.canceled_at ? new Date(row.canceled_at) : undefined,
    cancelReason: row.cancel_reason as CommercialDocument['cancelReason'],
    cancelNote: row.cancel_note ?? undefined,
    lifecycleEvents: (row.lifecycle_events as CommercialDocumentLifecycleEvent[]).map((event) => ({
      ...event,
      at: new Date(event.at),
    })),
    outputEvents: (row.output_events as CommercialDocumentOutputEvent[]).map((event) => ({
      ...event,
      at: new Date(event.at),
    })),
    orderRevisions: (row.order_revisions as CommercialDocumentOrderRevision[]).map((revision) => ({
      ...revision,
      createdAt: new Date(revision.createdAt),
    })),
  };
}
