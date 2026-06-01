import type { CommercialDocument } from '../../domain/commercialDocument.js';

export interface QuoteRepository {
  save(quote: CommercialDocument): Promise<void>;
  getById(id: string): Promise<CommercialDocument | null>;
}
