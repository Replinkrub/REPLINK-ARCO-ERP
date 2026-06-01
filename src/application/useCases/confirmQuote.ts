import { confirmQuote as confirmQuoteDomain, convertQuoteToOrder, type CommercialDocument } from '../../domain/commercialDocument.js';
import { DOMAIN_ERROR_CODES } from '../../domain/validation.js';
import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { OrderRepository } from '../ports/orderRepository.js';
import type { QuoteRepository } from '../ports/quoteRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../result.js';

export interface ConfirmQuoteUseCaseInput {
  quoteId: string;
  actor: AccessContext;
  orderSequence: number;
  now?: Date;
}

export interface ConfirmQuoteUseCaseDeps {
  quoteRepository: QuoteRepository;
  orderRepository: OrderRepository;
}

export async function confirmQuoteUseCase(
  deps: ConfirmQuoteUseCaseDeps,
  input: ConfirmQuoteUseCaseInput
): Promise<ApplicationResult<CommercialDocument>> {
  const quote = await deps.quoteRepository.getById(input.quoteId);
  if (!quote) {
    return applicationFailure(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND, 'Orçamento não encontrado', { id: input.quoteId });
  }

  if (quote.documentType !== 'quote') {
    return applicationFailure(APPLICATION_ERROR_CODES.DOCUMENT_NOT_QUOTE, 'A confirmação só aceita quote', {
      id: input.quoteId,
      documentType: quote.documentType,
    });
  }

  const now = input.now ?? new Date();
  const accessAndTransition = confirmQuoteDomain(quote, input.actor, now);
  if (!accessAndTransition.ok) {
    if (
      accessAndTransition.error.code === DOMAIN_ERROR_CODES.OWNERSHIP_DENIED ||
      accessAndTransition.error.code === DOMAIN_ERROR_CODES.TENANT_MISMATCH ||
      accessAndTransition.error.code === DOMAIN_ERROR_CODES.OPERATION_DENIED
    ) {
      return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Acesso negado para confirmar orçamento', {
        domainError: accessAndTransition.error,
      });
    }

    if (accessAndTransition.error.code === DOMAIN_ERROR_CODES.DOCUMENT_ALREADY_CONFIRMED) {
      return applicationFailure(APPLICATION_ERROR_CODES.CONFLICT_ALREADY_CONFIRMED, 'Orçamento já confirmado', {
        domainError: accessAndTransition.error,
      });
    }

    return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao confirmar orçamento', {
      domainError: accessAndTransition.error,
    });
  }

  const converted = convertQuoteToOrder(quote, input.orderSequence, now);
  if (!converted.ok) {
    if (converted.error.code === DOMAIN_ERROR_CODES.DOCUMENT_ALREADY_CONFIRMED) {
      return applicationFailure(APPLICATION_ERROR_CODES.CONFLICT_ALREADY_CONFIRMED, 'Orçamento já confirmado', {
        domainError: converted.error,
      });
    }

    return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao converter orçamento em pedido', {
      domainError: converted.error,
    });
  }

  const saveOrder = await deps.orderRepository.saveFromQuoteOnce(converted.document);
  if (!saveOrder.ok) {
    return applicationFailure(APPLICATION_ERROR_CODES.CONFLICT_ALREADY_CONFIRMED, 'Orçamento já confirmado', {
      source_quote_id: quote.id,
    });
  }

  return applicationSuccess(converted.document);
}
