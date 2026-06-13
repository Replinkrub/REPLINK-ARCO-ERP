import { randomUUID } from 'node:crypto';
import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { CustomerProductPriceOverrideRecord, CustomerProductPriceOverrideRepository, CustomerProductPriceOverrideStatus } from '../ports/customerProductPriceOverrideRepository.js';
import type { CustomerRepository } from '../ports/customerRepository.js';
import type { ProductRepository } from '../ports/productRepository.js';
import type { RepresentedCompanyRepository } from '../ports/representedCompanyRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationFailureResult, type ApplicationResult } from '../result.js';

export interface CustomerProductPriceOverridePayload {
  [key: string]: unknown;
  id?: unknown;
  productId?: unknown;
  product_id?: unknown;
  unitPrice?: unknown;
  unit_price?: unknown;
  validFrom?: unknown;
  valid_from?: unknown;
  validUntil?: unknown;
  valid_until?: unknown;
  status?: unknown;
}

export interface CustomerProductPriceOverrideResponse {
  id: string;
  tenantId: string;
  customerId: string;
  representedCompanyId: string;
  productId: string;
  unitPrice: number;
  validFrom: string;
  validUntil?: string;
  status: CustomerProductPriceOverrideStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerProductPriceOverrideListResponse {
  items: CustomerProductPriceOverrideResponse[];
  page: number;
  pageSize: number;
  total: number;
}

type Deps = {
  customerProductPriceOverrideRepository: CustomerProductPriceOverrideRepository;
  customerRepository: CustomerRepository;
  representedCompanyRepository: RepresentedCompanyRepository;
  productRepository: ProductRepository;
};

type Patch = Partial<Omit<CustomerProductPriceOverrideRecord, 'id' | 'tenantId' | 'customerId' | 'representedCompanyId' | 'createdAt' | 'updatedAt'>>;

const OUT_OF_SCOPE_FIELDS = new Set(['quote', 'order', 'snapshot', 'promotion', 'campaign', 'margin', 'commission', 'discount', 'price_tiers', 'priceTiers', 'commercial_status', 'commercialStatus']);

export async function listCustomerProductPriceOverridesUseCase(
  deps: Pick<Deps, 'customerProductPriceOverrideRepository' | 'customerRepository' | 'representedCompanyRepository'>,
  input: { actor: AccessContext; customerId: string; representedCompanyId: string; productId?: string; page?: number; pageSize?: number }
): Promise<ApplicationResult<CustomerProductPriceOverrideListResponse>> {
  if (!isSupportedRole(input.actor.role)) return forbidden();
  const base = await validateBase(deps, input.actor, input.customerId, input.representedCompanyId);
  if (!base.ok) return base;
  const page = normalizePositiveInteger(input.page, 1);
  const pageSize = Math.min(normalizePositiveInteger(input.pageSize, 20), 100);
  const result = await deps.customerProductPriceOverrideRepository.list({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    customerId: input.customerId,
    representedCompanyId: input.representedCompanyId,
    productId: input.productId,
    page,
    pageSize,
  });
  return applicationSuccess({ items: result.items.map(toResponse), page: result.page, pageSize: result.pageSize, total: result.total });
}

export async function getCustomerProductPriceOverrideUseCase(
  deps: Pick<Deps, 'customerProductPriceOverrideRepository' | 'customerRepository' | 'representedCompanyRepository'>,
  input: { actor: AccessContext; customerId: string; representedCompanyId: string; overrideId: string }
): Promise<ApplicationResult<CustomerProductPriceOverrideResponse>> {
  if (!isSupportedRole(input.actor.role)) return forbidden();
  const base = await validateBase(deps, input.actor, input.customerId, input.representedCompanyId);
  if (!base.ok) return base;
  const override = await deps.customerProductPriceOverrideRepository.getById({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, customerId: input.customerId, representedCompanyId: input.representedCompanyId, overrideId: input.overrideId });
  if (!override) return overrideNotFound(input.overrideId);
  return applicationSuccess(toResponse(override));
}

export async function createCustomerProductPriceOverrideUseCase(
  deps: Deps,
  input: { actor: AccessContext; customerId: string; representedCompanyId: string; payload: CustomerProductPriceOverridePayload; now?: Date }
): Promise<ApplicationResult<CustomerProductPriceOverrideResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScope = findOutOfScopeField(input.payload);
  if (outOfScope) return validationError('Campo fora do escopo de override de preço por cliente/produto', outOfScope);
  const normalized = normalizePayload(input.payload, true);
  if (!normalized.ok) return normalized;
  const candidate = { ...normalized.data, status: normalized.data.status ?? 'active' };
  const validation = await validateOverrideRule(deps, input.actor, input.customerId, input.representedCompanyId, candidate);
  if (!validation.ok) return validation;
  if (candidate.status === 'active' && await deps.customerProductPriceOverrideRepository.hasActiveForScope({ tenantId: input.actor.actorTenantId, customerId: input.customerId, representedCompanyId: input.representedCompanyId, productId: candidate.productId })) {
    return duplicateActiveOverride();
  }
  try {
    const override = await deps.customerProductPriceOverrideRepository.create({
      id: stringOptional(input.payload.id) ?? randomUUID(),
      tenantId: input.actor.actorTenantId,
      customerId: input.customerId,
      representedCompanyId: input.representedCompanyId,
      productId: candidate.productId,
      unitPrice: candidate.unitPrice,
      validFrom: candidate.validFrom,
      validUntil: candidate.validUntil,
      status: candidate.status,
      now: input.now,
    });
    return applicationSuccess(toResponse(override));
  } catch (error) {
    return mapPersistenceError(error);
  }
}

export async function updateCustomerProductPriceOverrideUseCase(
  deps: Deps,
  input: { actor: AccessContext; customerId: string; representedCompanyId: string; overrideId: string; payload: CustomerProductPriceOverridePayload; now?: Date }
): Promise<ApplicationResult<CustomerProductPriceOverrideResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScope = findOutOfScopeField(input.payload);
  if (outOfScope) return validationError('Campo fora do escopo de override de preço por cliente/produto', outOfScope);
  const current = await deps.customerProductPriceOverrideRepository.getById({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, customerId: input.customerId, representedCompanyId: input.representedCompanyId, overrideId: input.overrideId });
  if (!current) return overrideNotFound(input.overrideId);
  const normalized = normalizePayload(input.payload, false);
  if (!normalized.ok) return normalized;
  const next = {
    productId: normalized.data.productId ?? current.productId,
    unitPrice: normalized.data.unitPrice ?? current.unitPrice,
    validFrom: normalized.data.validFrom ?? current.validFrom,
    validUntil: normalized.data.validUntil ?? current.validUntil,
    status: normalized.data.status ?? current.status,
  };
  const validation = await validateOverrideRule(deps, input.actor, input.customerId, input.representedCompanyId, next);
  if (!validation.ok) return validation;
  if (next.status === 'active' && await deps.customerProductPriceOverrideRepository.hasActiveForScope({ tenantId: input.actor.actorTenantId, customerId: input.customerId, representedCompanyId: input.representedCompanyId, productId: next.productId, ignoreOverrideId: input.overrideId })) {
    return duplicateActiveOverride();
  }
  try {
    const override = await deps.customerProductPriceOverrideRepository.update({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, customerId: input.customerId, representedCompanyId: input.representedCompanyId, overrideId: input.overrideId, patch: normalized.data, now: input.now });
    if (!override) return overrideNotFound(input.overrideId);
    return applicationSuccess(toResponse(override));
  } catch (error) {
    return mapPersistenceError(error);
  }
}

async function validateBase(
  deps: Pick<Deps, 'customerRepository' | 'representedCompanyRepository'>,
  actor: AccessContext,
  customerId: string,
  representedCompanyId: string
): Promise<{ ok: true } | ApplicationFailureResult> {
  const customer = await deps.customerRepository.getById({ tenantId: actor.actorTenantId, actorId: actor.actorId, role: actor.role as 'ADMIN' | 'REPRESENTANTE', customerId });
  if (!customer) return customerNotFound(customerId);
  const represented = await deps.representedCompanyRepository.getById({ tenantId: actor.actorTenantId, representedCompanyId });
  if (!represented || represented.status !== 'active') return representedCompanyNotFound(representedCompanyId);
  return { ok: true };
}

async function validateOverrideRule(
  deps: Pick<Deps, 'customerRepository' | 'representedCompanyRepository' | 'productRepository'>,
  actor: AccessContext,
  customerId: string,
  representedCompanyId: string,
  override: Pick<CustomerProductPriceOverrideRecord, 'productId' | 'unitPrice' | 'validFrom' | 'status'> & Pick<Partial<CustomerProductPriceOverrideRecord>, 'validUntil'>
): Promise<{ ok: true } | ApplicationFailureResult> {
  const base = await validateBase(deps, actor, customerId, representedCompanyId);
  if (!base.ok) return base;
  const product = await deps.productRepository.getById({ tenantId: actor.actorTenantId, actorId: actor.actorId, role: actor.role as 'ADMIN' | 'REPRESENTANTE', productId: override.productId });
  if (!product) return productNotFound(override.productId);
  if (product.status !== 'active') return validationError('Produto deve estar ativo', 'product_id');
  if (product.representedCompanyId !== representedCompanyId) return validationError('Produto deve pertencer à mesma representada do override', 'product_id');
  if (override.validUntil !== undefined && override.validUntil < override.validFrom) return validationError('valid_until deve ser maior ou igual a valid_from', 'valid_until');
  return { ok: true };
}

function normalizePayload(payload: CustomerProductPriceOverridePayload, requireCore: true): ApplicationResult<Patch & Pick<CustomerProductPriceOverrideRecord, 'productId' | 'unitPrice' | 'validFrom'>>;
function normalizePayload(payload: CustomerProductPriceOverridePayload, requireCore: false): ApplicationResult<Patch>;
function normalizePayload(payload: CustomerProductPriceOverridePayload, requireCore: boolean): ApplicationResult<Patch> {
  const productId = stringOptional(payload.productId ?? payload.product_id);
  const unitPrice = positiveNumberOptional(payload.unitPrice ?? payload.unit_price, 'unit_price');
  if (!unitPrice.ok) return unitPrice;
  const validFrom = dateStringOptional(payload.validFrom ?? payload.valid_from, 'valid_from');
  if (!validFrom.ok) return validFrom;
  const validUntil = dateStringOptional(payload.validUntil ?? payload.valid_until, 'valid_until');
  if (!validUntil.ok) return validUntil;
  const status = stringOptional(payload.status);
  if (requireCore && !productId) return validationError('product_id é obrigatório', 'product_id');
  if (requireCore && unitPrice.value === undefined) return validationError('unit_price é obrigatório', 'unit_price');
  if (requireCore && !validFrom.value) return validationError('valid_from é obrigatório', 'valid_from');
  if (status !== undefined && status !== 'active' && status !== 'inactive') return validationError('status inválido', 'status');
  if (validFrom.value && validUntil.value && validUntil.value < validFrom.value) return validationError('valid_until deve ser maior ou igual a valid_from', 'valid_until');
  const normalized: Patch = {};
  if (productId !== undefined) normalized.productId = productId;
  if (unitPrice.value !== undefined) normalized.unitPrice = unitPrice.value;
  if (validFrom.value !== undefined) normalized.validFrom = validFrom.value;
  if (validUntil.value !== undefined) normalized.validUntil = validUntil.value;
  if (status !== undefined) normalized.status = status as CustomerProductPriceOverrideStatus;
  return applicationSuccess(normalized);
}

function toResponse(override: CustomerProductPriceOverrideRecord): CustomerProductPriceOverrideResponse {
  return { ...override, createdAt: override.createdAt.toISOString(), updatedAt: override.updatedAt.toISOString() };
}

function dateStringOptional(value: unknown, field: string): { ok: true; value?: string } | ApplicationFailureResult {
  const normalized = stringOptional(value);
  if (normalized === undefined) return { ok: true };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return validationError(`${field} deve usar formato YYYY-MM-DD`, field);
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return validationError(`${field} inválida`, field);
  return { ok: true, value: normalized };
}

function positiveNumberOptional(value: unknown, field: string): { ok: true; value?: number } | ApplicationFailureResult {
  if (value === undefined || value === null || value === '') return { ok: true };
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return validationError(`${field} deve ser maior que zero`, field);
  return { ok: true, value: number };
}

function stringOptional(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function findOutOfScopeField(payload: CustomerProductPriceOverridePayload): string | null {
  for (const field of Object.keys(payload)) if (OUT_OF_SCOPE_FIELDS.has(field)) return field;
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

function productNotFound(productId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.PRODUCT_NOT_FOUND, 'Produto não encontrado', { productId });
}

function overrideNotFound(overrideId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.CUSTOMER_PRODUCT_PRICE_OVERRIDE_NOT_FOUND, 'Override de preço não encontrado', { overrideId });
}

function duplicateActiveOverride() {
  return applicationFailure(APPLICATION_ERROR_CODES.DUPLICATE_ACTIVE_CUSTOMER_PRODUCT_PRICE_OVERRIDE, 'Já existe override ativo para cliente, representada e produto');
}

function forbidden() {
  return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Ação não permitida');
}

function isSupportedRole(role: AccessContext['role']): role is 'ADMIN' | 'REPRESENTANTE' {
  return role === 'ADMIN' || role === 'REPRESENTANTE';
}

function mapPersistenceError(error: unknown): ApplicationFailureResult {
  const pgError = error as { code?: string; constraint?: string };
  if (pgError.code === '23505' || pgError.constraint === 'idx_customer_product_price_overrides_one_active') return duplicateActiveOverride();
  if (pgError.code === '23503' || pgError.code === '23514') return validationError('Override de preço viola regra de integridade', 'customer_product_price_override');
  throw error;
}
