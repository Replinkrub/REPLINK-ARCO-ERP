import type { CommercialDocument } from '../../domain/commercialDocument.js';

export interface SaveOrderFromQuoteResult {
  ok: boolean;
}

export interface OrderRepository {
  save(order: CommercialDocument): Promise<void>;
  saveFromQuoteOnce(order: CommercialDocument): Promise<SaveOrderFromQuoteResult>;
  getById(id: string): Promise<CommercialDocument | null>;
  getBySourceQuoteId(sourceQuoteId: string): Promise<CommercialDocument | null>;
}
