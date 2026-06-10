import { randomUUID } from 'node:crypto';
import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { PriceTableRepository } from '../ports/priceTableRepository.js';
import type { ProductRepository } from '../ports/productRepository.js';
import type { PriceTableItemRecord, PriceTableItemRepository, PriceTableItemStatus } from '../ports/priceTableItemRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationFailureResult, type ApplicationResult } from '../result.js';

export interface PriceTableItemPayload {
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

type PriceTableItemPatchPayload = Partial<Omit<PriceTableItemRecord, 'id' | 'tenantId' | 'priceTableId' | 'createdAt' | 'updatedAt'>>;

const OUT_OF_SCOPE_FIELDS = new Set([
  'override',
  'override_price',
  'overridePrice',
  'discount',
  'margin',
  'payment_terms',
  'paymentTerms',
  'payment_term',
  'paymentTerm',
  'quote',
  'order',
  'commercial_status',
  'commercialStatus',
  'stock',
  'fiscal',
  'nfe',
  'nf_e',
  'commission',
  'price_tiers',
  'priceTiers',
  'promotion',
  'campaign',
  'customer_commercial_profiles',
  'customerCommercialProfiles',
  'default_price_table_id',
  'defaultPriceTableId',
]);

export interface PriceTableItemResponse {
  id: string;
  tenantId: string;
  priceTableId: string;
  productId: string;
  unitPrice: number;
  validFrom: string;
  validUntil?: string;
  status: PriceTableItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PriceTableItemListResponse {
  items: PriceTableItemResponse[];
  page: number;
  pageSize: number;
  total: number;
}

type PriceTableItemDeps = {
  priceTableItemRepository: PriceTableItemRepository;
  priceTableRepository: PriceTableRepository;
  productRepository: ProductRepository;
};

export async function listPriceTableItemsUseCase(
  deps: Pick<PriceTableItemDeps, 'priceTableItemRepository' | 'priceTableRepository'>,
  input: { actor: AccessContext; priceTableId: string; page?: number; pageSize?: number }
): Promise<ApplicationResult<PriceTableItemListResponse>> {
  if (!isSupportedPriceTableItemRole(input.actor.role)) return forbidden();
  const priceTable = await deps.priceTableRepository.getById(scope(input.actor, input.priceTableId));
  if (!priceTable) return priceTableNotFound(input.priceTableId);
  const page = normalizePositiveInteger(input.page, 1);
  const pageSize = Math.min(normalizePositiveInteger(input.pageSize, 20), 100);
  const result = await deps.priceTableItemRepository.listByPriceTable({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    priceTableId: input.priceTableId,
    page,
    pageSize,
  });
  return applicationSuccess({ items: result.items.map(toPriceTableItemResponse), page: result.page, pageSize: result.pageSize, total: result.total });
}

export async function getPriceTableItemUseCase(
  deps: Pick<PriceTableItemDeps, 'priceTableItemRepository' | 'priceTableRepository'>,
  input: { actor: AccessContext; priceTableId: string; itemId: string }
): Promise<ApplicationResult<PriceTableItemResponse>> {
  if (!isSupportedPriceTableItemRole(input.actor.role)) return forbidden();
  const priceTable = await deps.priceTableRepository.getById(scope(input.actor, input.priceTableId));
  if (!priceTable) return priceTableNotFound(input.priceTableId);
  const item = await deps.priceTableItemRepository.getById({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    priceTableId: input.priceTableId,
    itemId: input.itemId,
  });
  if (!item) return priceTableItemNotFound(input.itemId);
  return applicationSuccess(toPriceTableItemResponse(item));
}

export async function createPriceTableItemUseCase(
  deps: PriceTableItemDeps,
  input: { actor: AccessContext; priceTableId: string; payload: PriceTableItemPayload; now?: Date }
): Promise<ApplicationResult<PriceTableItemResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR8B2', outOfScopeField);
  const normalized = normalizePriceTableItemPayload(input.payload, true);
  if (!normalized.ok) return normalized;
  const candidate = { ...normalized.data, status: normalized.data.status ?? 'active' };
  const validation = await validatePriceTableItemRule(deps, input.actor, input.priceTableId, candidate);
  if (!validation.ok) return validation;
  if (await deps.priceTableItemRepository.hasActiveOverlap({ tenantId: input.actor.actorTenantId, priceTableId: input.priceTableId, productId: normalized.data.productId, validFrom: normalized.data.validFrom, validUntil: normalized.data.validUntil })) {
    return duplicatePriceTableItemPeriod();
  }
  try {
    const item = await deps.priceTableItemRepository.create({
      id: stringOptional(input.payload.id) ?? randomUUID(),
      tenantId: input.actor.actorTenantId,
      priceTableId: input.priceTableId,
      productId: normalized.data.productId,
      unitPrice: normalized.data.unitPrice,
      validFrom: normalized.data.validFrom,
      validUntil: normalized.data.validUntil,
      status: normalized.data.status ?? 'active',
      now: input.now,
    });
    return applicationSuccess(toPriceTableItemResponse(item));
  } catch (error) {
    return mapPersistenceError(error);
  }
}

export async function updatePriceTableItemUseCase(
  deps: PriceTableItemDeps,
  input: { actor: AccessContext; priceTableId: string; itemId: string; payload: PriceTableItemPayload; now?: Date }
): Promise<ApplicationResult<PriceTableItemResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const current = await deps.priceTableItemRepository.getById({ tenantId: input.actor.actorTenantId, actorId: input.actor.actorId, role: input.actor.role, priceTableId: input.priceTableId, itemId: input.itemId });
  if (!current) return priceTableItemNotFound(input.itemId);
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR8B2', outOfScopeField);
  const normalized = normalizePriceTableItemPayload(input.payload, false);
  if (!normalized.ok) return normalized;
  const next: PriceTableItemPatchPayload & Pick<PriceTableItemRecord, 'productId' | 'unitPrice' | 'validFrom' | 'status'> = {
    productId: normalized.data.productId ?? current.productId,
    unitPrice: normalized.data.unitPrice ?? current.unitPrice,
    validFrom: normalized.data.validFrom ?? current.validFrom,
    validUntil: normalized.data.validUntil ?? current.validUntil,
    status: normalized.data.status ?? current.status,
  };
  const validation = await validatePriceTableItemRule(deps, input.actor, input.priceTableId, next);
  if (!validation.ok) return validation;
  if (await deps.priceTableItemRepository.hasActiveOverlap({ tenantId: input.actor.actorTenantId, priceTableId: input.priceTableId, productId: next.productId, validFrom: next.validFrom, validUntil: next.validUntil, ignoreItemId: input.itemId })) {
    return duplicatePriceTableItemPeriod();
  }
  try {
    const item = await deps.priceTableItemRepository.update({
      tenantId: input.actor.actorTenantId,
      actorId: input.actor.actorId,
      role: input.actor.role,
      priceTableId: input.priceTableId,
      itemId: input.itemId,
      patch: normalized.data,
      now: input.now,
    });
    if (!item) return priceTableItemNotFound(input.itemId);
    return applicationSuccess(toPriceTableItemResponse(item));
  } catch (error) {
    return mapPersistenceError(error);
  }
}

async function validatePriceTableItemRule(
  deps: Pick<PriceTableItemDeps, 'priceTableRepository' | 'productRepository'>,
  actor: AccessContext,
  priceTableId: string,
  item: Pick<PriceTableItemRecord, 'productId' | 'unitPrice' | 'validFrom' | 'status'> & Pick<Partial<PriceTableItemRecord>, 'validUntil'>
): Promise<{ ok: true } | ApplicationFailureResult> {
  const priceTable = await deps.priceTableRepository.getById(scope(actor, priceTableId));
  if (!priceTable) return priceTableNotFound(priceTableId);
  const product = await deps.productRepository.getById({ tenantId: actor.actorTenantId, actorId: actor.actorId, role: actor.role === 'REPRESENTANTE' ? 'REPRESENTANTE' : 'ADMIN', productId: item.productId });
  if (!product) return productNotFound(item.productId);
  if (priceTable.status !== 'active') return validationError('Tabela de preço deve estar ativa', 'price_table_id');
  if (product.status !== 'active') return validationError('Produto deve estar ativo', 'product_id');
  if (priceTable.representedCompanyId !== product.representedCompanyId) return validationError('Produto e tabela de preço devem pertencer à mesma representada', 'product_id');
  if (item.validUntil !== undefined && item.validUntil < item.validFrom) return validationError('valid_until deve ser maior ou igual a valid_from', 'valid_until');
  if (item.validFrom < priceTable.validFrom) return validationError('valid_from deve estar dentro da vigência da tabela de preço', 'valid_from');
  if (priceTable.validUntil !== undefined) {
    if (item.validUntil === undefined) return validationError('valid_until é obrigatório quando a tabela possui fim de vigência', 'valid_until');
    if (item.validUntil > priceTable.validUntil) return validationError('valid_until deve estar dentro da vigência da tabela de preço', 'valid_until');
  }
  if (priceTable.validUntil === undefined && item.validUntil !== undefined && item.validUntil < item.validFrom) return validationError('valid_until deve ser maior ou igual a valid_from', 'valid_until');
  return { ok: true };
}

function normalizePriceTableItemPayload(payload: PriceTableItemPayload, requireCore: true): ApplicationResult<PriceTableItemPatchPayload & Pick<PriceTableItemRecord, 'productId' | 'unitPrice' | 'validFrom'>>;
function normalizePriceTableItemPayload(payload: PriceTableItemPayload, requireCore: false): ApplicationResult<PriceTableItemPatchPayload>;
function normalizePriceTableItemPayload(payload: PriceTableItemPayload, requireCore: boolean): ApplicationResult<PriceTableItemPatchPayload> {
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
  const normalized: PriceTableItemPatchPayload = {};
  if (productId !== undefined) normalized.productId = productId;
  if (unitPrice.value !== undefined) normalized.unitPrice = unitPrice.value;
  if (validFrom.value !== undefined) normalized.validFrom = validFrom.value;
  if (validUntil.value !== undefined) normalized.validUntil = validUntil.value;
  if (status !== undefined) normalized.status = status as PriceTableItemStatus;
  return applicationSuccess(normalized);
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

function scope(actor: AccessContext, priceTableId: string) {
  return { tenantId: actor.actorTenantId, actorId: actor.actorId, role: actor.role as 'ADMIN' | 'REPRESENTANTE', priceTableId };
}

function toPriceTableItemResponse(item: PriceTableItemRecord): PriceTableItemResponse {
  return { ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}

function validationError(message: string, field: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, message, { field });
}

function findOutOfScopeField(payload: PriceTableItemPayload): string | null {
  for (const field of Object.keys(payload)) {
    if (OUT_OF_SCOPE_FIELDS.has(field)) return field;
  }
  return null;
}

function priceTableNotFound(priceTableId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.PRICE_TABLE_NOT_FOUND, 'Tabela de preço não encontrada', { priceTableId });
}

function priceTableItemNotFound(itemId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.PRICE_TABLE_ITEM_NOT_FOUND, 'Item da tabela de preço não encontrado', { itemId });
}

function productNotFound(productId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.PRODUCT_NOT_FOUND, 'Produto não encontrado', { productId });
}

function duplicatePriceTableItemPeriod() {
  return applicationFailure(APPLICATION_ERROR_CODES.DUPLICATE_PRICE_TABLE_ITEM_PERIOD, 'Item de preço já existe com vigência conflitante para este produto', { fields: ['product_id', 'valid_from', 'valid_until'] });
}

function forbidden() {
  return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Ação não permitida');
}

function mapPersistenceError(error: unknown): ApplicationResult<PriceTableItemResponse> {
  if (isForeignKeyViolation(error)) return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Referência inválida para item da tabela de preço', { fields: ['price_table_id', 'product_id'] });
  if (isCheckViolation(error)) return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Dados inválidos para item da tabela de preço', { fields: ['unit_price', 'valid_until', 'status'] });
  throw error;
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23503';
}

function isCheckViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23514';
}

function isSupportedPriceTableItemRole(role: AccessContext['role']): role is 'ADMIN' | 'REPRESENTANTE' {
  return role === 'ADMIN' || role === 'REPRESENTANTE';
}
