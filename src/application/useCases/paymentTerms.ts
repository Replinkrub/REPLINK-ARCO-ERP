import { randomUUID } from 'node:crypto';
import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { PaymentTermRecord, PaymentTermRepository, PaymentTermStatus } from '../ports/paymentTermRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationFailureResult, type ApplicationResult } from '../result.js';

export interface PaymentTermPayload {
  [key: string]: unknown;
  id?: unknown;
  name?: unknown;
  description?: unknown;
  installmentsCount?: unknown;
  installments_count?: unknown;
  firstDueDays?: unknown;
  first_due_days?: unknown;
  intervalDays?: unknown;
  interval_days?: unknown;
  status?: unknown;
}

type PaymentTermPatchPayload = Partial<Omit<PaymentTermRecord, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>;

const OUT_OF_SCOPE_FIELDS = new Set([
  'price_table',
  'price_tables',
  'priceTableId',
  'price_table_id',
  'customer',
  'customer_id',
  'customerId',
  'quote',
  'order',
  'commercial_document',
  'commercialDocument',
  'installments',
  'due_dates',
  'dueDates',
  'invoice',
  'billing',
  'boleto',
  'gateway',
]);

export interface PaymentTermResponse {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  installmentsCount: number;
  firstDueDays: number;
  intervalDays: number;
  status: PaymentTermStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTermListResponse {
  items: PaymentTermResponse[];
  page: number;
  pageSize: number;
  total: number;
}

export async function listPaymentTermsUseCase(
  deps: { paymentTermRepository: PaymentTermRepository },
  input: { actor: AccessContext; page?: number; pageSize?: number; q?: string }
): Promise<ApplicationResult<PaymentTermListResponse>> {
  if (!isSupportedPaymentTermRole(input.actor.role)) return forbidden();
  const page = normalizePositiveInteger(input.page, 1);
  const pageSize = Math.min(normalizePositiveInteger(input.pageSize, 20), 100);
  const result = await deps.paymentTermRepository.list({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    page,
    pageSize,
    q: input.q?.trim() || undefined,
  });
  return applicationSuccess({ items: result.items.map(toPaymentTermResponse), page: result.page, pageSize: result.pageSize, total: result.total });
}

export async function getPaymentTermUseCase(
  deps: { paymentTermRepository: PaymentTermRepository },
  input: { actor: AccessContext; paymentTermId: string }
): Promise<ApplicationResult<PaymentTermResponse>> {
  if (!isSupportedPaymentTermRole(input.actor.role)) return forbidden();
  const paymentTerm = await deps.paymentTermRepository.getById({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    paymentTermId: input.paymentTermId,
  });
  if (!paymentTerm) return paymentTermNotFound(input.paymentTermId);
  return applicationSuccess(toPaymentTermResponse(paymentTerm));
}

export async function createPaymentTermUseCase(
  deps: { paymentTermRepository: PaymentTermRepository },
  input: { actor: AccessContext; payload: PaymentTermPayload; now?: Date }
): Promise<ApplicationResult<PaymentTermResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo de Payment Terms Foundation', outOfScopeField);
  const normalized = normalizePaymentTermPayload(input.payload, true);
  if (!normalized.ok) return normalized;
  try {
    const paymentTerm = await deps.paymentTermRepository.create({
      id: stringOptional(input.payload.id) ?? randomUUID(),
      tenantId: input.actor.actorTenantId,
      ...normalized.data,
      status: normalized.data.status ?? 'active',
      now: input.now,
    });
    return applicationSuccess(toPaymentTermResponse(paymentTerm));
  } catch (error) {
    return mapPersistenceError(error);
  }
}

export async function updatePaymentTermUseCase(
  deps: { paymentTermRepository: PaymentTermRepository },
  input: { actor: AccessContext; paymentTermId: string; payload: PaymentTermPayload; now?: Date }
): Promise<ApplicationResult<PaymentTermResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo de Payment Terms Foundation', outOfScopeField);
  const normalized = normalizePaymentTermPayload(input.payload, false);
  if (!normalized.ok) return normalized;
  try {
    const paymentTerm = await deps.paymentTermRepository.update({
      tenantId: input.actor.actorTenantId,
      actorId: input.actor.actorId,
      role: input.actor.role,
      paymentTermId: input.paymentTermId,
      patch: normalized.data,
      now: input.now,
    });
    if (!paymentTerm) return paymentTermNotFound(input.paymentTermId);
    return applicationSuccess(toPaymentTermResponse(paymentTerm));
  } catch (error) {
    return mapPersistenceError(error);
  }
}

function normalizePaymentTermPayload(payload: PaymentTermPayload, requireCore: true): ApplicationResult<PaymentTermPatchPayload & Pick<PaymentTermRecord, 'name' | 'installmentsCount' | 'firstDueDays' | 'intervalDays'>>;
function normalizePaymentTermPayload(payload: PaymentTermPayload, requireCore: false): ApplicationResult<PaymentTermPatchPayload>;
function normalizePaymentTermPayload(payload: PaymentTermPayload, requireCore: boolean): ApplicationResult<PaymentTermPatchPayload> {
  const name = stringOptional(payload.name);
  const description = stringOptional(payload.description);
  const status = stringOptional(payload.status);
  const installmentsCount = positiveIntegerOptional(payload.installmentsCount ?? payload.installments_count, 'installments_count');
  if (!installmentsCount.ok) return installmentsCount;
  const firstDueDays = nonNegativeIntegerOptional(payload.firstDueDays ?? payload.first_due_days, 'first_due_days');
  if (!firstDueDays.ok) return firstDueDays;
  const intervalDays = nonNegativeIntegerOptional(payload.intervalDays ?? payload.interval_days, 'interval_days');
  if (!intervalDays.ok) return intervalDays;

  if (requireCore && !name) return validationError('name é obrigatório', 'name');
  if (requireCore && installmentsCount.value === undefined) return validationError('installments_count é obrigatório', 'installments_count');
  if (requireCore && firstDueDays.value === undefined) return validationError('first_due_days é obrigatório', 'first_due_days');
  if (requireCore && intervalDays.value === undefined) return validationError('interval_days é obrigatório', 'interval_days');
  if (status !== undefined && status !== 'active' && status !== 'inactive') return validationError('status inválido', 'status');

  const normalized: PaymentTermPatchPayload = {};
  if (name !== undefined) normalized.name = name;
  if (description !== undefined) normalized.description = description;
  if (installmentsCount.value !== undefined) normalized.installmentsCount = installmentsCount.value;
  if (firstDueDays.value !== undefined) normalized.firstDueDays = firstDueDays.value;
  if (intervalDays.value !== undefined) normalized.intervalDays = intervalDays.value;
  if (status !== undefined) normalized.status = status as PaymentTermStatus;
  return applicationSuccess(normalized);
}

function positiveIntegerOptional(value: unknown, field: string): { ok: true; value?: number } | ApplicationFailureResult {
  if (value === undefined || value === null || value === '') return { ok: true };
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return validationError(`${field} deve ser inteiro positivo`, field);
  return { ok: true, value: number };
}

function nonNegativeIntegerOptional(value: unknown, field: string): { ok: true; value?: number } | ApplicationFailureResult {
  if (value === undefined || value === null || value === '') return { ok: true };
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return validationError(`${field} deve ser inteiro não negativo`, field);
  return { ok: true, value: number };
}

function stringOptional(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function toPaymentTermResponse(paymentTerm: PaymentTermRecord): PaymentTermResponse {
  return { ...paymentTerm, createdAt: paymentTerm.createdAt.toISOString(), updatedAt: paymentTerm.updatedAt.toISOString() };
}

function validationError(message: string, field: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, message, { field });
}

function findOutOfScopeField(payload: PaymentTermPayload): string | null {
  for (const field of Object.keys(payload)) {
    if (OUT_OF_SCOPE_FIELDS.has(field)) return field;
  }
  return null;
}

function paymentTermNotFound(paymentTermId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.PAYMENT_TERM_NOT_FOUND, 'Condição de pagamento não encontrada', { paymentTermId });
}

function forbidden() {
  return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Ação não permitida');
}

function mapPersistenceError(error: unknown): ApplicationResult<PaymentTermResponse> {
  if (isUniqueViolation(error)) return applicationFailure(APPLICATION_ERROR_CODES.DUPLICATE_PAYMENT_TERM, 'Condição de pagamento já existe neste tenant', { fields: ['name'] });
  if (isForeignKeyViolation(error)) return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Referência inválida para condição de pagamento', { fields: ['tenant_id'] });
  if (isCheckViolation(error)) return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Dados inválidos para condição de pagamento', { fields: ['status', 'installments_count', 'first_due_days', 'interval_days'] });
  throw error;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23503';
}

function isCheckViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23514';
}

function isSupportedPaymentTermRole(role: AccessContext['role']): role is 'ADMIN' | 'REPRESENTANTE' {
  return role === 'ADMIN' || role === 'REPRESENTANTE';
}
