import { invoiceOrder, type CommercialDocument } from '../../domain/commercialDocument.js';
import type { AccessContext } from '../../domain/ownership.js';
import { DOMAIN_ERROR_CODES } from '../../domain/validation.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { OrderRepository } from '../ports/orderRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../result.js';

export interface RegisterSimpleInvoiceUseCaseInput {
  orderId: string;
  actor: AccessContext;
  manualReference?: string;
  now?: Date;
}

export interface RegisterSimpleInvoiceUseCaseDeps {
  orderRepository: OrderRepository;
}

export async function registerSimpleInvoiceUseCase(
  deps: RegisterSimpleInvoiceUseCaseDeps,
  input: RegisterSimpleInvoiceUseCaseInput
): Promise<ApplicationResult<CommercialDocument>> {
  const orderId = input.orderId.trim();
  if (!orderId) {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'orderId deve ser informado', {
      orderId: input.orderId,
    });
  }

  const order = await deps.orderRepository.getById(orderId);
  if (!order) {
    return applicationFailure(APPLICATION_ERROR_CODES.DOCUMENT_NOT_FOUND, 'Pedido não encontrado', { id: orderId });
  }

  if (input.actor.role !== 'ADMIN' && input.actor.role !== 'OWNER') {
    return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Acesso negado para faturar pedido', {
      role: input.actor.role,
    });
  }

  const result = invoiceOrder(order, input.actor, input.manualReference, input.now ?? new Date());
  if (!result.ok) {
    if (
      result.error.code === DOMAIN_ERROR_CODES.OWNERSHIP_DENIED ||
      result.error.code === DOMAIN_ERROR_CODES.TENANT_MISMATCH ||
      result.error.code === DOMAIN_ERROR_CODES.OPERATION_DENIED
    ) {
      return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Acesso negado para faturar pedido', {
        domainError: result.error,
      });
    }

    return applicationFailure(APPLICATION_ERROR_CODES.DOMAIN_OPERATION_FAILED, 'Falha ao registrar faturamento simples', {
      domainError: result.error,
    });
  }

  await deps.orderRepository.save(result.document);
  return applicationSuccess(result.document);
}
