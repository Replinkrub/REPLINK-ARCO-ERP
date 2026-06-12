import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { CustomerRepository } from '../ports/customerRepository.js';
import type { CustomerRepresentedCommercialProfileRecord, CustomerRepresentedCommercialProfileRepository } from '../ports/customerRepresentedCommercialProfileRepository.js';
import type { PaymentTermRepository } from '../ports/paymentTermRepository.js';
import type { PriceTableRepository } from '../ports/priceTableRepository.js';
import type { RepresentedCompanyRepository } from '../ports/representedCompanyRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationFailureResult, type ApplicationResult } from '../result.js';

export interface CustomerRepresentedCommercialProfilePayload {
  [key: string]: unknown;
  defaultPriceTableId?: unknown;
  default_price_table_id?: unknown;
  defaultPaymentTermId?: unknown;
  default_payment_term_id?: unknown;
}

export interface CustomerRepresentedCommercialProfileResponse {
  tenantId: string;
  customerId: string;
  representedCompanyId: string;
  defaultPriceTableId: string | null;
  defaultPaymentTermId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface Deps {
  customerRepository: CustomerRepository;
  representedCompanyRepository: RepresentedCompanyRepository;
  customerRepresentedCommercialProfileRepository: CustomerRepresentedCommercialProfileRepository;
  priceTableRepository: PriceTableRepository;
  paymentTermRepository: PaymentTermRepository;
}

const OUT_OF_SCOPE_FIELDS = new Set([
  'override',
  'overrides',
  'product_id',
  'productId',
  'unit_price',
  'unitPrice',
  'quote',
  'order',
  'snapshot',
  'calculation',
  'engine',
]);

export async function getCustomerRepresentedCommercialProfileUseCase(
  deps: Pick<Deps, 'customerRepository' | 'representedCompanyRepository' | 'customerRepresentedCommercialProfileRepository'>,
  input: { actor: AccessContext; customerId: string; representedCompanyId: string }
): Promise<ApplicationResult<CustomerRepresentedCommercialProfileResponse>> {
  if (!isSupportedRole(input.actor.role)) return forbidden();
  const customer = await deps.customerRepository.getById(customerScope(input.actor, input.customerId));
  if (!customer) return customerNotFound(input.customerId);
  const represented = await deps.representedCompanyRepository.getById({ tenantId: input.actor.actorTenantId, representedCompanyId: input.representedCompanyId });
  if (!represented || represented.status !== 'active') return representedCompanyNotFound(input.representedCompanyId);
  const profile = await deps.customerRepresentedCommercialProfileRepository.getByCustomerAndRepresented({
    tenantId: input.actor.actorTenantId,
    customerId: input.customerId,
    representedCompanyId: input.representedCompanyId,
  });
  return applicationSuccess(toResponse(input.actor.actorTenantId, input.customerId, input.representedCompanyId, profile));
}

export async function updateCustomerRepresentedCommercialProfileUseCase(
  deps: Deps,
  input: { actor: AccessContext; customerId: string; representedCompanyId: string; payload: CustomerRepresentedCommercialProfilePayload; now?: Date }
): Promise<ApplicationResult<CustomerRepresentedCommercialProfileResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do perfil comercial por representada', outOfScopeField);
  const normalized = normalizePayload(input.payload);
  if (!normalized.ok) return normalized;

  const customer = await deps.customerRepository.getById(customerScope(input.actor, input.customerId));
  if (!customer) return customerNotFound(input.customerId);
  const represented = await deps.representedCompanyRepository.getById({ tenantId: input.actor.actorTenantId, representedCompanyId: input.representedCompanyId });
  if (!represented || represented.status !== 'active') return representedCompanyNotFound(input.representedCompanyId);

  if (normalized.defaultPriceTableId !== undefined && normalized.defaultPriceTableId !== null) {
    const priceTable = await deps.priceTableRepository.getById({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, priceTableId: normalized.defaultPriceTableId });
    if (!priceTable) return priceTableNotFound(normalized.defaultPriceTableId);
    if (priceTable.status !== 'active') return validationError('Tabela de preço deve estar ativa', 'default_price_table_id');
    if (priceTable.representedCompanyId !== undefined && priceTable.representedCompanyId !== input.representedCompanyId) {
      return validationError('Tabela de preço deve ser global ou da mesma representada', 'default_price_table_id');
    }
  }

  if (normalized.defaultPaymentTermId !== undefined && normalized.defaultPaymentTermId !== null) {
    const paymentTerm = await deps.paymentTermRepository.getById({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, paymentTermId: normalized.defaultPaymentTermId });
    if (!paymentTerm) return paymentTermNotFound(normalized.defaultPaymentTermId);
    if (paymentTerm.status !== 'active') return validationError('Condição de pagamento deve estar ativa', 'default_payment_term_id');
  }

  const profile = await deps.customerRepresentedCommercialProfileRepository.upsertDefaults({
    tenantId: input.actor.actorTenantId,
    customerId: input.customerId,
    representedCompanyId: input.representedCompanyId,
    defaultPriceTableId: normalized.defaultPriceTableId,
    defaultPaymentTermId: normalized.defaultPaymentTermId,
    now: input.now,
  });
  return applicationSuccess(toResponse(input.actor.actorTenantId, input.customerId, input.representedCompanyId, profile));
}

function normalizePayload(payload: CustomerRepresentedCommercialProfilePayload): { ok: true; defaultPriceTableId?: string | null; defaultPaymentTermId?: string | null } | ApplicationFailureResult {
  const priceTable = normalizeNullableString(payload, 'default_price_table_id', 'defaultPriceTableId');
  if (!priceTable.ok) return priceTable;
  const paymentTerm = normalizeNullableString(payload, 'default_payment_term_id', 'defaultPaymentTermId');
  if (!paymentTerm.ok) return paymentTerm;
  if (priceTable.value === undefined && paymentTerm.value === undefined) return validationError('default_price_table_id ou default_payment_term_id é obrigatório', 'default_price_table_id');
  return { ok: true, defaultPriceTableId: priceTable.value, defaultPaymentTermId: paymentTerm.value };
}

function normalizeNullableString(payload: CustomerRepresentedCommercialProfilePayload, snakeField: keyof CustomerRepresentedCommercialProfilePayload, camelField: keyof CustomerRepresentedCommercialProfilePayload): { ok: true; value?: string | null } | ApplicationFailureResult {
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

function toResponse(tenantId: string, customerId: string, representedCompanyId: string, profile: CustomerRepresentedCommercialProfileRecord | null): CustomerRepresentedCommercialProfileResponse {
  return {
    tenantId,
    customerId,
    representedCompanyId,
    defaultPriceTableId: profile?.defaultPriceTableId ?? null,
    defaultPaymentTermId: profile?.defaultPaymentTermId ?? null,
    createdAt: profile?.createdAt.toISOString(),
    updatedAt: profile?.updatedAt.toISOString(),
  };
}

function findOutOfScopeField(payload: CustomerRepresentedCommercialProfilePayload): string | null {
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

function representedCompanyNotFound(representedCompanyId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Representada não encontrada ou inativa', { representedCompanyId });
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
