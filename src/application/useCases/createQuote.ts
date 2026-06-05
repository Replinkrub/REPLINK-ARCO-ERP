import { createQuote as createQuoteDocument, type CommercialDocument } from '../../domain/commercialDocument.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../result.js';
import type { QuoteRepository } from '../ports/quoteRepository.js';

export interface CreateQuoteUseCaseInput {
  id: string;
  tenantId: string;
  representedCompanyId?: string;
  customerId: string;
  ownerId: string;
  representativeId: string;
  numberSequence?: number;
  now?: Date;
}

export interface CreateQuoteUseCaseDeps {
  quoteRepository: QuoteRepository;
}

export async function createQuoteUseCase(
  deps: CreateQuoteUseCaseDeps,
  input: CreateQuoteUseCaseInput
): Promise<ApplicationResult<CommercialDocument>> {
  const customerId = input.customerId.trim();
  if (!customerId) {
    return applicationFailure(
      APPLICATION_ERROR_CODES.REQUIRED_CUSTOMER_ID,
      'Cliente é obrigatório para criar orçamento'
    );
  }

  const quote = createQuoteDocument({
    id: input.id,
    tenantId: input.tenantId,
    representedCompanyId: input.representedCompanyId,
    customerId,
    ownerId: input.ownerId,
    representativeId: input.representativeId,
    numberSequence: input.numberSequence,
    now: input.now,
  });

  await deps.quoteRepository.save(quote);
  return applicationSuccess(quote);
}
