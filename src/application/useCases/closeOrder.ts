import {
  adjustConfirmedOrder,
  cancelDocument,
  type CommercialDocument,
  type CommercialDocumentAdminAdjustmentChanges,
} from '../../domain/commercialDocument.js';
import type { AccessContext } from '../../domain/ownership.js';
import type { AdjustmentReason, CancelReason } from '../../domain/types.js';
import { DOMAIN_ERROR_CODES } from '../../domain/validation.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { OrderRepository } from '../ports/orderRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../result.js';

const CANCEL_REASONS: readonly CancelReason[] = [
  'CLIENTE_DESISTIU',
  'PRECO_CONDICAO_REPROVADA',
  'ERRO_CADASTRO_CLIENTE',
  'ERRO_ITEM_QUANTIDADE',
  'ERRO_CONDICAO_PAGAMENTO',
  'PRODUTO_INDISPONIVEL',
  'DUPLICIDADE',
  'PRAZO_ENTREGA_INVIAVEL',
  'CANCELAMENTO_INTERNO',
  'OUTROS',
];

const ADJUSTMENT_REASONS: readonly AdjustmentReason[] = [
  'AJUSTE_PRECO',
  'AJUSTE_DESCONTO',
  'AJUSTE_QUANTIDADE',
  'AJUSTE_ITEM',
  'AJUSTE_CONDICAO_PAGAMENTO',
  'AJUSTE_FRETE',
  'AJUSTE_DADOS_CLIENTE',
  'AJUSTE_FISCAL_OPERACIONAL',
  'CORRECAO_ERRO_OPERADOR',
  'OUTROS',
];

export interface CancelOrderUseCaseInput {
  orderId: string;
  actor: AccessContext;
  reason: CancelReason | string;
  note?: string;
  now?: Date;
}

export interface AdjustOrderUseCaseInput {
  orderId: string;
  actor: AccessContext;
  reason: AdjustmentReason | string;
  note?: string;
  changes?: CommercialDocumentAdminAdjustmentChanges;
  now?: Date;
}

export interface CloseOrderUseCaseDeps {
  orderRepository: OrderRepository;
}

export async function cancelOrderUseCase(
  deps: CloseOrderUseCaseDeps,
  input: CancelOrderUseCaseInput
): Promise<ApplicationResult<CommercialDocument>> {
  const orderId = input.orderId.trim();
  if (!orderId) {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'orderId deve ser informado', {
      orderId: input.orderId,
    });
  }

  if (!CANCEL_REASONS.includes(input.reason as CancelReason)) {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Motivo de cancelamento inválido', {
      reason: input.reason,
    });
  }

  const order = await deps.orderRepository.getById(orderId);
  if (!order) {
    return applicationFailure(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND, 'Pedido não encontrado', { id: orderId });
  }

  const result = cancelDocument(order, input.actor, input.reason as CancelReason, input.note, input.now ?? new Date());
  if (!result.ok) {
    if (
      result.error.code === DOMAIN_ERROR_CODES.OWNERSHIP_DENIED ||
      result.error.code === DOMAIN_ERROR_CODES.TENANT_MISMATCH ||
      result.error.code === DOMAIN_ERROR_CODES.OPERATION_DENIED ||
      (result.error.code === DOMAIN_ERROR_CODES.INVALID_DOCUMENT_STATE &&
        (result.error.message.includes('Apenas ADMIN/OWNER') || result.error.message.includes('Role sem permissão')))
    ) {
      return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Acesso negado para cancelar pedido', {
        domainError: result.error,
      });
    }

    if (result.error.code === DOMAIN_ERROR_CODES.INVALID_CANCEL_REASON) {
      return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Motivo de cancelamento inválido', {
        domainError: result.error,
      });
    }

    return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao cancelar pedido', {
      domainError: result.error,
    });
  }

  await deps.orderRepository.save(result.document);
  return applicationSuccess(result.document);
}

export async function adjustOrderUseCase(
  deps: CloseOrderUseCaseDeps,
  input: AdjustOrderUseCaseInput
): Promise<ApplicationResult<CommercialDocument>> {
  const orderId = input.orderId.trim();
  if (!orderId) {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'orderId deve ser informado', {
      orderId: input.orderId,
    });
  }

  if (!ADJUSTMENT_REASONS.includes(input.reason as AdjustmentReason)) {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Motivo de ajuste inválido', {
      reason: input.reason,
    });
  }

  const order = await deps.orderRepository.getById(orderId);
  if (!order) {
    return applicationFailure(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND, 'Pedido não encontrado', { id: orderId });
  }

  const result = adjustConfirmedOrder(
    order,
    input.actor,
    input.reason as AdjustmentReason,
    input.note,
    input.changes,
    input.now ?? new Date()
  );
  if (!result.ok) {
    if (
      result.error.code === DOMAIN_ERROR_CODES.OWNERSHIP_DENIED ||
      result.error.code === DOMAIN_ERROR_CODES.TENANT_MISMATCH ||
      result.error.code === DOMAIN_ERROR_CODES.OPERATION_DENIED ||
      (result.error.code === DOMAIN_ERROR_CODES.INVALID_DOCUMENT_STATE &&
        (result.error.message.includes('Apenas ADMIN/OWNER') || result.error.message.includes('Role sem permissão')))
    ) {
      return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Acesso negado para ajustar pedido', {
        domainError: result.error,
      });
    }

    if (result.error.code === DOMAIN_ERROR_CODES.INVALID_ADJUSTMENT_REASON) {
      return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Motivo de ajuste inválido', {
        domainError: result.error,
      });
    }

    return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao ajustar pedido', {
      domainError: result.error,
    });
  }

  await deps.orderRepository.save(result.document);
  return applicationSuccess(result.document);
}
