import type { OrderRepository, SaveOrderFromQuoteResult } from '../../application/ports/orderRepository.js';
import type { CommercialDocument } from '../../domain/commercialDocument.js';

export class InMemoryOrderRepository implements OrderRepository {
  private readonly byId = new Map<string, CommercialDocument>();
  private readonly bySourceQuoteId = new Map<string, string>();

  async save(order: CommercialDocument): Promise<void> {
    if (order.documentType !== 'order') {
      throw new Error('ORDER_REPOSITORY_ONLY_ACCEPTS_ORDERS');
    }

    if (!order.source_quote_id) {
      throw new Error('ORDER_REPOSITORY_REQUIRES_SOURCE_QUOTE_ID');
    }

    const existingOrderId = this.bySourceQuoteId.get(order.source_quote_id);
    if (existingOrderId && existingOrderId !== order.id) {
      throw new Error('ORDER_REPOSITORY_SOURCE_QUOTE_CONFLICT');
    }

    this.bySourceQuoteId.set(order.source_quote_id, order.id);
    this.byId.set(order.id, structuredClone(order));
  }

  async saveFromQuoteOnce(order: CommercialDocument): Promise<SaveOrderFromQuoteResult> {
    if (order.documentType !== 'order') {
      throw new Error('ORDER_REPOSITORY_ONLY_ACCEPTS_ORDERS');
    }

    if (!order.source_quote_id) {
      throw new Error('ORDER_REPOSITORY_REQUIRES_SOURCE_QUOTE_ID');
    }

    if (this.bySourceQuoteId.has(order.source_quote_id)) {
      return { ok: false };
    }

    await this.save(order);
    return { ok: true };
  }

  async getById(id: string): Promise<CommercialDocument | null> {
    const order = this.byId.get(id);
    return order ? structuredClone(order) : null;
  }

  async getBySourceQuoteId(sourceQuoteId: string): Promise<CommercialDocument | null> {
    const id = this.bySourceQuoteId.get(sourceQuoteId);
    if (!id) return null;
    return this.getById(id);
  }
}
