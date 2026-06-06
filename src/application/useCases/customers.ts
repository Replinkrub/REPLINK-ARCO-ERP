import { randomUUID } from 'node:crypto';
import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { CustomerRecord, CustomerRepository, CustomerStatus } from '../ports/customerRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../result.js';

export interface CustomerPayload {
  [key: string]: unknown;
  id?: unknown;
  legalName?: unknown;
  legal_name?: unknown;
  tradeName?: unknown;
  trade_name?: unknown;
  documentType?: unknown;
  document_type?: unknown;
  documentNumber?: unknown;
  document_number?: unknown;
  status?: unknown;
  segment?: unknown;
  notes?: unknown;
  ownerId?: unknown;
  owner_id?: unknown;
  representativeId?: unknown;
  representative_id?: unknown;
}

type CustomerPatchPayload = Partial<Pick<CustomerRecord, 'legalName' | 'tradeName' | 'documentType' | 'documentNumber' | 'status' | 'segment' | 'notes'>>;

const OUT_OF_SCOPE_FIELDS = new Set([
  'contacts',
  'contact',
  'addresses',
  'address',
  'customer_contacts',
  'customer_addresses',
  'commercialProfile',
  'commercial_profile',
  'customer_commercial_profile',
  'defaultPaymentTermId',
  'default_payment_term_id',
  'defaultPriceTableId',
  'default_price_table_id',
]);

export interface CustomerResponse {
  id: string;
  tenantId: string;
  legalName: string;
  tradeName?: string;
  documentType: string;
  documentNumber: string;
  status: CustomerStatus;
  segment?: string;
  notes?: string;
  ownerId?: string;
  representativeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListResponse {
  items: CustomerResponse[];
  page: number;
  pageSize: number;
  total: number;
}

export async function listCustomersUseCase(
  deps: { customerRepository: CustomerRepository },
  input: { actor: AccessContext; page?: number; pageSize?: number; q?: string }
): Promise<ApplicationResult<CustomerListResponse>> {
  if (!isSupportedCustomerRole(input.actor.role)) return forbidden();
  const page = normalizePositiveInteger(input.page, 1);
  const pageSize = Math.min(normalizePositiveInteger(input.pageSize, 20), 100);
  const result = await deps.customerRepository.list({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    page,
    pageSize,
    q: input.q?.trim() || undefined,
  });

  return applicationSuccess({
    items: result.items.map(toCustomerResponse),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
  });
}

export async function getCustomerUseCase(
  deps: { customerRepository: CustomerRepository },
  input: { actor: AccessContext; customerId: string }
): Promise<ApplicationResult<CustomerResponse>> {
  if (!isSupportedCustomerRole(input.actor.role)) return forbidden();
  const customer = await deps.customerRepository.getById({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    customerId: input.customerId,
  });
  if (!customer) return customerNotFound(input.customerId);
  return applicationSuccess(toCustomerResponse(customer));
}

export async function createCustomerUseCase(
  deps: { customerRepository: CustomerRepository },
  input: { actor: AccessContext; payload: CustomerPayload; now?: Date }
): Promise<ApplicationResult<CustomerResponse>> {
  if (!isSupportedCustomerRole(input.actor.role)) return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR7A', outOfScopeField);
  const normalized = normalizeCustomerPayload(input.payload, true);
  if (!normalized.ok) return normalized;

  const requestedOwnerId = stringOptional(input.payload.ownerId ?? input.payload.owner_id);
  const requestedRepresentativeId = stringOptional(input.payload.representativeId ?? input.payload.representative_id);
  if (input.actor.role === 'REPRESENTANTE' && (
    (requestedOwnerId !== undefined && requestedOwnerId !== input.actor.actorId)
    || (requestedRepresentativeId !== undefined && requestedRepresentativeId !== input.actor.actorId)
  )) {
    return forbidden();
  }

  try {
    const customer = await deps.customerRepository.create({
      id: stringOptional(input.payload.id) ?? randomUUID(),
      tenantId: input.actor.actorTenantId,
      legalName: normalized.data.legalName,
      tradeName: normalized.data.tradeName,
      documentType: normalized.data.documentType,
      documentNumber: normalized.data.documentNumber,
      status: normalized.data.status ?? 'active',
      segment: normalized.data.segment,
      notes: normalized.data.notes,
      ownerId: requestedOwnerId ?? input.actor.actorId,
      representativeId: requestedRepresentativeId ?? input.actor.actorId,
      now: input.now,
    });
    return applicationSuccess(toCustomerResponse(customer));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return applicationFailure(
        APPLICATION_ERROR_CODES.DUPLICATE_CUSTOMER_DOCUMENT,
        'Cliente já existe para este documento no tenant',
        { fields: ['document_type', 'document_number'] }
      );
    }
    throw error;
  }
}

export async function updateCustomerUseCase(
  deps: { customerRepository: CustomerRepository },
  input: { actor: AccessContext; customerId: string; payload: CustomerPayload; now?: Date }
): Promise<ApplicationResult<CustomerResponse>> {
  if (!isSupportedCustomerRole(input.actor.role)) return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR7A', outOfScopeField);
  if (input.payload.ownerId !== undefined || input.payload.owner_id !== undefined || input.payload.representativeId !== undefined || input.payload.representative_id !== undefined) {
    return forbidden();
  }
  const normalized = normalizeCustomerPayload(input.payload, false);
  if (!normalized.ok) return normalized;

  try {
    const customer = await deps.customerRepository.update({
      tenantId: input.actor.actorTenantId,
      actorId: input.actor.actorId,
      role: input.actor.role,
      customerId: input.customerId,
      patch: normalized.data,
      now: input.now,
    });
    if (!customer) return customerNotFound(input.customerId);
    return applicationSuccess(toCustomerResponse(customer));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return applicationFailure(
        APPLICATION_ERROR_CODES.DUPLICATE_CUSTOMER_DOCUMENT,
        'Cliente já existe para este documento no tenant',
        { fields: ['document_type', 'document_number'] }
      );
    }
    throw error;
  }
}

function normalizeCustomerPayload(payload: CustomerPayload, requireCore: true): ApplicationResult<CustomerPatchPayload & Pick<CustomerRecord, 'legalName' | 'documentType' | 'documentNumber'>>;
function normalizeCustomerPayload(payload: CustomerPayload, requireCore: false): ApplicationResult<CustomerPatchPayload>;
function normalizeCustomerPayload(payload: CustomerPayload, requireCore: boolean): ApplicationResult<CustomerPatchPayload> {
  const legalName = stringOptional(payload.legalName ?? payload.legal_name);
  const documentType = stringOptional(payload.documentType ?? payload.document_type);
  const documentNumber = stringOptional(payload.documentNumber ?? payload.document_number);
  const status = stringOptional(payload.status);

  if (requireCore && !legalName) return validationError('legal_name é obrigatório', 'legal_name');
  if (requireCore && !documentType) return validationError('document_type é obrigatório', 'document_type');
  if (requireCore && !documentNumber) return validationError('document_number é obrigatório', 'document_number');
  if (status !== undefined && status !== 'active' && status !== 'inactive') return validationError('status inválido', 'status');

  const normalized: CustomerPatchPayload = {};
  if (legalName !== undefined) normalized.legalName = legalName;
  const tradeName = stringOptional(payload.tradeName ?? payload.trade_name);
  if (tradeName !== undefined) normalized.tradeName = tradeName;
  if (documentType !== undefined) normalized.documentType = documentType;
  if (documentNumber !== undefined) normalized.documentNumber = documentNumber;
  if (status !== undefined) normalized.status = status as CustomerStatus;
  const segment = stringOptional(payload.segment);
  if (segment !== undefined) normalized.segment = segment;
  const notes = stringOptional(payload.notes);
  if (notes !== undefined) normalized.notes = notes;

  return applicationSuccess(normalized);
}

function toCustomerResponse(customer: CustomerRecord): CustomerResponse {
  return {
    id: customer.id,
    tenantId: customer.tenantId,
    legalName: customer.legalName,
    tradeName: customer.tradeName,
    documentType: customer.documentType,
    documentNumber: customer.documentNumber,
    status: customer.status,
    segment: customer.segment,
    notes: customer.notes,
    ownerId: customer.ownerId,
    representativeId: customer.representativeId,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function stringOptional(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function validationError(message: string, field: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, message, { field });
}

function findOutOfScopeField(payload: CustomerPayload): string | null {
  for (const field of Object.keys(payload)) {
    if (OUT_OF_SCOPE_FIELDS.has(field)) return field;
  }
  return null;
}

function customerNotFound(customerId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.CUSTOMER_NOT_FOUND, 'Cliente não encontrado', { customerId });
}

function forbidden() {
  return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Operação não permitida');
}

function isSupportedCustomerRole(role: AccessContext['role']): role is 'ADMIN' | 'REPRESENTANTE' {
  return role === 'ADMIN' || role === 'REPRESENTANTE';
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
}
