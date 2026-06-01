import { registerOutputEvent, type CommercialDocument } from '../../domain/commercialDocument.js';
import type { AccessContext } from '../../domain/ownership.js';
import type { CommercialDocumentType, OutputEventChannel } from '../../domain/types.js';
import { DOMAIN_ERROR_CODES } from '../../domain/validation.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { OrderRepository } from '../ports/orderRepository.js';
import type { QuoteRepository } from '../ports/quoteRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../result.js';

const OUTPUT_CHANNELS: readonly OutputEventChannel[] = [
  'SEND_WHATSAPP',
  'SEND_EMAIL',
  'GENERATE_PDF',
  'PRINT',
  'COPY_LINK',
  'SHARE',
];

export interface RegisterDocumentCommunicationInput {
  documentType: CommercialDocumentType | string;
  documentId: string;
  actor: AccessContext;
  channel: OutputEventChannel | string;
  event: string;
  now?: Date;
}

export interface RegisterDocumentCommunicationDeps {
  quoteRepository: QuoteRepository;
  orderRepository: OrderRepository;
}

export async function registerDocumentCommunicationUseCase(
  deps: RegisterDocumentCommunicationDeps,
  input: RegisterDocumentCommunicationInput
): Promise<ApplicationResult<CommercialDocument>> {
  const documentId = input.documentId.trim();
  if (!documentId) {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'documentId deve ser informado', {
      documentId: input.documentId,
    });
  }

  if (input.documentType !== 'quote' && input.documentType !== 'order') {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'documentType inválido', {
      documentType: input.documentType,
    });
  }

  if (!OUTPUT_CHANNELS.includes(input.channel as OutputEventChannel)) {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'canal de comunicação inválido', {
      channel: input.channel,
    });
  }

  const event = input.event.trim();
  if (!event) {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'event deve ser informado', {
      event: input.event,
    });
  }

  const document =
    input.documentType === 'quote'
      ? await deps.quoteRepository.getById(documentId)
      : await deps.orderRepository.getById(documentId);

  if (!document) {
    return applicationFailure(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND, 'Documento não encontrado', {
      id: documentId,
      documentType: input.documentType,
    });
  }

  const result = registerOutputEvent(document, input.actor, input.channel as OutputEventChannel, event, input.now ?? new Date());
  if (!result.ok) {
    if (
      result.error.code === DOMAIN_ERROR_CODES.TENANT_MISMATCH ||
      result.error.code === DOMAIN_ERROR_CODES.OWNERSHIP_DENIED ||
      result.error.code === DOMAIN_ERROR_CODES.OPERATION_DENIED
    ) {
      return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Acesso negado para registrar comunicação', {
        domainError: result.error,
      });
    }

    return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao registrar comunicação do documento', {
      domainError: result.error,
    });
  }

  if (input.documentType === 'quote') {
    await deps.quoteRepository.save(result.document);
  } else {
    await deps.orderRepository.save(result.document);
  }

  return applicationSuccess(result.document);
}
