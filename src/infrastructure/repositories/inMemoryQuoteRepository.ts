import type {
  CommercialDocument,
  CommercialDocumentLifecycleEvent,
  CommercialDocumentOrderRevision,
  CommercialDocumentOutputEvent,
} from '../../domain/commercialDocument.js';
import type { QuoteRepository } from '../../application/ports/quoteRepository.js';

export class InMemoryQuoteRepository implements QuoteRepository {
  private readonly items = new Map<string, CommercialDocument>();

  async save(quote: CommercialDocument): Promise<void> {
    if (quote.documentType !== 'quote') {
      throw new Error('QUOTE_REPOSITORY_ONLY_ACCEPTS_QUOTES');
    }

    this.items.set(quote.id, cloneQuoteDocument(quote));
  }

  async getById(id: string): Promise<CommercialDocument | null> {
    const stored = this.items.get(id);
    return stored ? cloneQuoteDocument(stored) : null;
  }
}

function cloneQuoteDocument(quote: CommercialDocument): CommercialDocument {
  return {
    ...quote,
    createdAt: new Date(quote.createdAt),
    updatedAt: new Date(quote.updatedAt),
    confirmedAt: quote.confirmedAt ? new Date(quote.confirmedAt) : undefined,
    invoicedAt: quote.invoicedAt ? new Date(quote.invoicedAt) : undefined,
    converted_at: quote.converted_at ? new Date(quote.converted_at) : undefined,
    canceledAt: quote.canceledAt ? new Date(quote.canceledAt) : undefined,
    items: quote.items.map((item) => ({ ...item })),
    totals: { ...quote.totals },
    paymentTermSnapshot: quote.paymentTermSnapshot ? { ...quote.paymentTermSnapshot } : undefined,
    paymentSchedule: quote.paymentSchedule ? quote.paymentSchedule.map((installment) => ({ ...installment })) : undefined,
    lifecycleEvents: quote.lifecycleEvents.map(cloneLifecycleEvent),
    outputEvents: quote.outputEvents.map(cloneOutputEvent),
    orderRevisions: quote.orderRevisions.map(cloneOrderRevision),
    sourceQuoteSnapshot: quote.sourceQuoteSnapshot
      ? {
          ...quote.sourceQuoteSnapshot,
          converted_at: new Date(quote.sourceQuoteSnapshot.converted_at),
          items: quote.sourceQuoteSnapshot.items.map((item) => ({ ...item })),
          totals: { ...quote.sourceQuoteSnapshot.totals },
          paymentTermSnapshot: quote.sourceQuoteSnapshot.paymentTermSnapshot ? { ...quote.sourceQuoteSnapshot.paymentTermSnapshot } : undefined,
          paymentSchedule: quote.sourceQuoteSnapshot.paymentSchedule ? quote.sourceQuoteSnapshot.paymentSchedule.map((installment) => ({ ...installment })) : undefined,
        }
      : undefined,
  };
}

function cloneLifecycleEvent(event: CommercialDocumentLifecycleEvent): CommercialDocumentLifecycleEvent {
  return { ...event, at: new Date(event.at) };
}

function cloneOutputEvent(event: CommercialDocumentOutputEvent): CommercialDocumentOutputEvent {
  return { ...event, at: new Date(event.at) };
}

function cloneOrderRevision(revision: CommercialDocumentOrderRevision): CommercialDocumentOrderRevision {
  return {
    ...revision,
    createdAt: new Date(revision.createdAt),
    beforePayload: {
      ...revision.beforePayload,
      items: revision.beforePayload.items.map((item) => ({ ...item })),
      totals: { ...revision.beforePayload.totals },
    },
    afterPayload: {
      ...revision.afterPayload,
      items: revision.afterPayload.items.map((item) => ({ ...item })),
      totals: { ...revision.afterPayload.totals },
    },
  };
}
