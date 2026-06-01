import {
  addItem,
  removeItem,
  updateItem,
  type AddItemInput,
  type CommercialDocument,
  type UpdateItemInput,
} from '../../domain/commercialDocument.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../result.js';
import type { QuoteRepository } from '../ports/quoteRepository.js';

export interface UpdateQuoteItemPatch {
  itemId: string;
  patch: UpdateItemInput;
}

export interface UpdateQuoteUseCaseInput {
  id: string;
  customerId?: string;
  addItems?: AddItemInput[];
  updateItems?: UpdateQuoteItemPatch[];
  removeItemIds?: string[];
}

export interface UpdateQuoteUseCaseDeps {
  quoteRepository: QuoteRepository;
}

export async function updateQuote(
  deps: UpdateQuoteUseCaseDeps,
  input: UpdateQuoteUseCaseInput
): Promise<ApplicationResult<CommercialDocument>> {
  const quote = await deps.quoteRepository.getById(input.id);
  if (!quote) {
    return applicationFailure(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND, 'Orçamento não encontrado', { id: input.id });
  }

  if (quote.documentType !== 'quote') {
    return applicationFailure(APPLICATION_ERROR_CODES.DOCUMENT_NOT_QUOTE, 'Repositório de orçamento aceita apenas quote', {
      id: input.id,
      documentType: quote.documentType,
    });
  }

  let nextDocument: CommercialDocument = { ...quote };

  if (input.customerId !== undefined) {
    const customerId = input.customerId.trim();
    if (!customerId) {
      return applicationFailure(
        APPLICATION_ERROR_CODES.REQUIRED_CUSTOMER_ID,
        'Cliente é obrigatório para atualizar orçamento'
      );
    }

    if (nextDocument.customerId !== customerId) {
      nextDocument = { ...nextDocument, customerId, updatedAt: new Date() };
    }
  }

  for (const item of input.addItems ?? []) {
    const result = addItem(nextDocument, item);
    if (!result.ok) {
      return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao adicionar item no orçamento', {
        domainError: result.error,
      });
    }
    nextDocument = result.document;
  }

  for (const itemPatch of input.updateItems ?? []) {
    const result = updateItem(nextDocument, itemPatch.itemId, itemPatch.patch);
    if (!result.ok) {
      return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao atualizar item no orçamento', {
        domainError: result.error,
      });
    }
    nextDocument = result.document;
  }

  for (const itemId of input.removeItemIds ?? []) {
    const result = removeItem(nextDocument, itemId);
    if (!result.ok) {
      return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao remover item do orçamento', {
        domainError: result.error,
      });
    }
    nextDocument = result.document;
  }

  await deps.quoteRepository.save(nextDocument);
  return applicationSuccess(nextDocument);
}
