import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { CustomerRepository } from '../ports/customerRepository.js';
import type { CustomerCommercialProfileRecord, CustomerCommercialProfileRepository } from '../ports/customerCommercialProfileRepository.js';
import type { PaymentTermRepository } from '../ports/paymentTermRepository.js';
import type { PriceTableRepository } from '../ports/priceTableRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationFailureResult, type ApplicationResult } from '../result.js';

export interface CustomerCommercialProfilePayload {
  [key: string]: unknown;
  defaultPriceTableId?: unknown;
  default_price_table_id?: unknown;
  defaultPaymentTermId?: unknown;
  default_payment_term_id?: unknown;
}

export interface CustomerCommercialProfileResponse {
  tenantId: string;
  customerId: string;
  defaultPriceTableId: string | null;
  defaultPaymentTermId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const OUT_OF_SCOPE_FIELDS = new Set([
  'payment_terms',
  'paymentTerms',
  'payment_term',
  'paymentTerm',
  'credit_limit',
  'creditLimit',
  'notes',
  'represented_company_id',
  'representedCompanyId',
  'price_table_items',
  'priceTableItems',
  'quote',
  'order',
  'commercial_status',
  'commercialStatus',
]);

export async function getCustomerCommercialProfileUseCase(
  deps: { customerRepository: CustomerRepository; customerCommercialProfileRepository: CustomerCommercialProfileRepository },
  input: { actor: AccessContext; customerId: string }
): Promise<ApplicationResult<CustomerCommercialProfileResponse>> {
  if (!isSupportedRole(input.actor.role)) return forbidden();
  const customer = await deps.customerRepository.getById(customerScope(input.actor, input.customerId));
  if (!customer) return customerNotFound(input.customerId);
  const profile = await deps.customerCommercialProfileRepository.getByCustomer({ tenantId: input.actor.actorTenantId, customerId: input.customerId });
  return applicationSuccess(toResponse(input.actor.actorTenantId, input.customerId, profile));
}

export async function updateCustomerCommercialProfileUseCase(
  deps: { customerRepository: CustomerRepository; customerCommercialProfileRepository: CustomerCommercialProfileRepository; priceTableRepository: PriceTableRepository; paymentTermRepository: PaymentTermRepository },
  input: { actor: AccessContext; customerId: string; payload: CustomerCommercialProfilePayload; now?: Date }
): Promise<ApplicationResult<CustomerCommercialProfileResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do Customer Commercial Profile', outOfScopeField);
  const normalized = normalizePayload(input.payload);
  if (!normalized.ok) return normalized;
  const customer = await deps.customerRepository.getById(customerScope(input.actor, input.customerId));
  if (!customer) return customerNotFound(input.customerId);

  if (normalized.defaultPriceTableId !== undefined && normalized.defaultPriceTableId !== null) {
    const priceTable = await deps.priceTableRepository.getById({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, priceTableId: normalized.defaultPriceTableId });
    if (!priceTable) return priceTableNotFound(normalized.defaultPriceTableId);
    if (priceTable.status !== 'active') return validationError('Tabela de preço deve estar ativa', 'default_price_table_id');
    if (priceTable.representedCompanyId !== undefined) return validationError('Apenas tabela de preço global pode ser vinculada ao cliente neste slice', 'default_price_table_id');
  }

  if (normalized.defaultPaymentTermId !== undefined && normalized.defaultPaymentTermId !== null) {
    const paymentTerm = await deps.paymentTermRepository.getById({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, paymentTermId: normalized.defaultPaymentTermId });
    if (!paymentTerm) return paymentTermNotFound(normalized.defaultPaymentTermId);
    if (paymentTerm.status !== 'active') return validationError('Condição de pagamento deve estar ativa', 'default_payment_term_id');
  }

  let profile: CustomerCommercialProfileRecord | null = null;
  if (normalized.defaultPriceTableId !== undefined) {
    profile = await deps.customerCommercialProfileRepository.upsertDefaultPriceTable({
      tenantId: input.actor.actorTenantId,
      customerId: input.customerId,
      defaultPriceTableId: normalized.defaultPriceTableId,
      now: input.now,
    });
  }
  if (normalized.defaultPaymentTermId !== undefined) {
    profile = await deps.customerCommercialProfileRepository.upsertDefaultPaymentTerm({
      tenantId: input.actor.actorTenantId,
      customerId: input.customerId,
      defaultPaymentTermId: normalized.defaultPaymentTermId,
      now: input.now,
    });
  }
  return applicationSuccess(toResponse(input.actor.actorTenantId, input.customerId, profile));
}

function normalizePayload(payload: CustomerCommercialProfilePayload): { ok: true; defaultPriceTableId?: string | null; defaultPaymentTermId?: string | null } | ApplicationFailureResult {
  const priceTable = normalizeNullableString(payload, 'default_price_table_id', 'defaultPriceTableId');
  if (!priceTable.ok) return priceTable;
  const paymentTerm = normalizeNullableString(payload, 'default_payment_term_id', 'defaultPaymentTermId');
  if (!paymentTerm.ok) return paymentTerm;
  if (priceTable.value === undefined && paymentTerm.value === undefined) return validationError('default_price_table_id ou default_payment_term_id é obrigatório', 'default_price_table_id');
  return { ok: true, defaultPriceTableId: priceTable.value, defaultPaymentTermId: paymentTerm.value };
}

function normalizeNullableString(payload: CustomerCommercialProfilePayload, snakeField: keyof CustomerCommercialProfilePayload, camelField: keyof CustomerCommercialProfilePayload): { ok: true; value?: string | null } | ApplicationFailureResult {
  const hasSnake = Object.prototype.hasOwnProperty.call(payload, snakeField);
  const hasCamel = Object.prototype.hasOwnProperty.call(payload, camelField);
  if (!hasSnake && !hasCamel) return { ok: true };
  const value = hasSnake ? payload[snakeField] : payload[camelField];
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string' || value.trim() === '') return validationError(`${String(snakeField)} deve ser string ou null`, String(snakeField));
  return { ok: true, value: value.trim() };
}

function customerScope(actor: AccessContext, customerId: string) {
  return { tenantId: actor.actorTenantId, actorId: actor.actorId, role: actor.role as 'ADMIN' | 'REPRESENTANTE', customerId };
}

function toResponse(tenantId: string, customerId: string, profile: CustomerCommercialProfileRecord | null): CustomerCommercialProfileResponse {
  return {
    tenantId,
    customerId,
    defaultPriceTableId: profile?.defaultPriceTableId ?? null,
    defaultPaymentTermId: profile?.defaultPaymentTermId ?? null,
    createdAt: profile?.createdAt.toISOString(),
    updatedAt: profile?.updatedAt.toISOString(),
  };
}

function findOutOfScopeField(payload: CustomerCommercialProfilePayload): string | null {
  for (const field of Object.keys(payload)) {
    if (OUT_OF_SCOPE_FIELDS.has(field)) return field;
  }
  return null;
}

function validationError(message: string, field: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, message, { field });
}

function customerNotFound(customerId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND, 'Cliente não encontrado', { customerId });
}

function priceTableNotFound(priceTableId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.PRICE_TABLE_NOT_FOUND, 'Tabela de preço não encontrada', { priceTableId });
}

function paymentTermNotFound(paymentTermId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.PAYMENT_TERM_NOT_FOUND, 'Condição de pagamento não encontrada', { paymentTermId });
}

function forbidden() {
  return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Ação não permitida');
}

function isSupportedRole(role: AccessContext['role']): role is 'ADMIN' | 'REPRESENTANTE' {
  return role === 'ADMIN' || role === 'REPRESENTANTE';
}
