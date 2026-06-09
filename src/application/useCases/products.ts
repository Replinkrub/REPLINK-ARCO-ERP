import { randomUUID } from 'node:crypto';
import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { ProductRecord, ProductRepository, ProductStatus } from '../ports/productRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationFailureResult, type ApplicationResult } from '../result.js';

export interface ProductPayload {
  [key: string]: unknown;
  id?: unknown;
  representedCompanyId?: unknown;
  represented_company_id?: unknown;
  sku?: unknown;
  name?: unknown;
  description?: unknown;
  commercialName?: unknown;
  commercial_name?: unknown;
  barcode?: unknown;
  brand?: unknown;
  categoryId?: unknown;
  category_id?: unknown;
  unitId?: unknown;
  unit_id?: unknown;
  packageInfo?: unknown;
  package_info?: unknown;
  minimumOrderQuantity?: unknown;
  minimum_order_quantity?: unknown;
  multipleOrderQuantity?: unknown;
  multiple_order_quantity?: unknown;
  grossWeight?: unknown;
  gross_weight?: unknown;
  netWeight?: unknown;
  net_weight?: unknown;
  dimensions?: unknown;
  availabilityStatus?: unknown;
  availability_status?: unknown;
  status?: unknown;
}

type ProductPatchPayload = Partial<Omit<ProductRecord, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>;

const OUT_OF_SCOPE_FIELDS = new Set([
  'price_table',
  'price_tables',
  'priceTableId',
  'price_table_id',
  'price_table_item',
  'price_table_items',
  'priceTableItems',
  'unitPrice',
  'unit_price',
  'payment_term',
  'payment_terms',
  'paymentTermId',
  'payment_term_id',
  'stock',
  'inventory',
  'commercial_document',
  'commercialDocument',
  'quote',
  'order',
]);

export interface ProductResponse {
  id: string;
  tenantId: string;
  representedCompanyId?: string;
  sku: string;
  name: string;
  description?: string;
  commercialName?: string;
  barcode?: string;
  brand?: string;
  categoryId?: string;
  unitId?: string;
  packageInfo?: string;
  minimumOrderQuantity?: number;
  multipleOrderQuantity?: number;
  grossWeight?: number;
  netWeight?: number;
  dimensions?: string;
  availabilityStatus?: string;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListResponse {
  items: ProductResponse[];
  page: number;
  pageSize: number;
  total: number;
}

export async function listProductsUseCase(
  deps: { productRepository: ProductRepository },
  input: { actor: AccessContext; page?: number; pageSize?: number; q?: string }
): Promise<ApplicationResult<ProductListResponse>> {
  if (!isSupportedProductRole(input.actor.role)) return forbidden();
  const page = normalizePositiveInteger(input.page, 1);
  const pageSize = Math.min(normalizePositiveInteger(input.pageSize, 20), 100);
  const result = await deps.productRepository.list({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    page,
    pageSize,
    q: input.q?.trim() || undefined,
  });
  return applicationSuccess({ items: result.items.map(toProductResponse), page: result.page, pageSize: result.pageSize, total: result.total });
}

export async function getProductUseCase(
  deps: { productRepository: ProductRepository },
  input: { actor: AccessContext; productId: string }
): Promise<ApplicationResult<ProductResponse>> {
  if (!isSupportedProductRole(input.actor.role)) return forbidden();
  const product = await deps.productRepository.getById({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    productId: input.productId,
  });
  if (!product) return productNotFound(input.productId);
  return applicationSuccess(toProductResponse(product));
}

export async function createProductUseCase(
  deps: { productRepository: ProductRepository },
  input: { actor: AccessContext; payload: ProductPayload; now?: Date }
): Promise<ApplicationResult<ProductResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR8A', outOfScopeField);
  const normalized = normalizeProductPayload(input.payload, true);
  if (!normalized.ok) return normalized;
  try {
    const product = await deps.productRepository.create({
      id: stringOptional(input.payload.id) ?? randomUUID(),
      tenantId: input.actor.actorTenantId,
      ...normalized.data,
      status: normalized.data.status ?? 'active',
      now: input.now,
    });
    return applicationSuccess(toProductResponse(product));
  } catch (error) {
    return mapPersistenceError(error);
  }
}

export async function updateProductUseCase(
  deps: { productRepository: ProductRepository },
  input: { actor: AccessContext; productId: string; payload: ProductPayload; now?: Date }
): Promise<ApplicationResult<ProductResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR8A', outOfScopeField);
  const normalized = normalizeProductPayload(input.payload, false);
  if (!normalized.ok) return normalized;
  try {
    const product = await deps.productRepository.update({
      tenantId: input.actor.actorTenantId,
      actorId: input.actor.actorId,
      role: input.actor.role,
      productId: input.productId,
      patch: normalized.data,
      now: input.now,
    });
    if (!product) return productNotFound(input.productId);
    return applicationSuccess(toProductResponse(product));
  } catch (error) {
    return mapPersistenceError(error);
  }
}

function normalizeProductPayload(payload: ProductPayload, requireCore: true): ApplicationResult<ProductPatchPayload & Pick<ProductRecord, 'sku' | 'name'>>;
function normalizeProductPayload(payload: ProductPayload, requireCore: false): ApplicationResult<ProductPatchPayload>;
function normalizeProductPayload(payload: ProductPayload, requireCore: boolean): ApplicationResult<ProductPatchPayload> {
  const sku = stringOptional(payload.sku);
  const name = stringOptional(payload.name);
  const status = stringOptional(payload.status);
  if (requireCore && !sku) return validationError('sku é obrigatório', 'sku');
  if (requireCore && !name) return validationError('name é obrigatório', 'name');
  if (status !== undefined && status !== 'active' && status !== 'inactive') return validationError('status inválido', 'status');

  const normalized: ProductPatchPayload = {};
  if (sku !== undefined) normalized.sku = sku;
  if (name !== undefined) normalized.name = name;
  if (status !== undefined) normalized.status = status as ProductStatus;
  setString(normalized, 'representedCompanyId', payload.representedCompanyId ?? payload.represented_company_id);
  setString(normalized, 'description', payload.description);
  setString(normalized, 'commercialName', payload.commercialName ?? payload.commercial_name);
  setString(normalized, 'barcode', payload.barcode);
  setString(normalized, 'brand', payload.brand);
  setString(normalized, 'categoryId', payload.categoryId ?? payload.category_id);
  setString(normalized, 'unitId', payload.unitId ?? payload.unit_id);
  setString(normalized, 'packageInfo', payload.packageInfo ?? payload.package_info);
  setString(normalized, 'dimensions', payload.dimensions);
  setString(normalized, 'availabilityStatus', payload.availabilityStatus ?? payload.availability_status);
  const minimumOrderQuantity = nonNegativeNumberOptional(payload.minimumOrderQuantity ?? payload.minimum_order_quantity, 'minimum_order_quantity');
  if (!minimumOrderQuantity.ok) return minimumOrderQuantity;
  if (minimumOrderQuantity.value !== undefined) normalized.minimumOrderQuantity = minimumOrderQuantity.value;
  const multipleOrderQuantity = nonNegativeNumberOptional(payload.multipleOrderQuantity ?? payload.multiple_order_quantity, 'multiple_order_quantity');
  if (!multipleOrderQuantity.ok) return multipleOrderQuantity;
  if (multipleOrderQuantity.value !== undefined) normalized.multipleOrderQuantity = multipleOrderQuantity.value;
  const grossWeight = nonNegativeNumberOptional(payload.grossWeight ?? payload.gross_weight, 'gross_weight');
  if (!grossWeight.ok) return grossWeight;
  if (grossWeight.value !== undefined) normalized.grossWeight = grossWeight.value;
  const netWeight = nonNegativeNumberOptional(payload.netWeight ?? payload.net_weight, 'net_weight');
  if (!netWeight.ok) return netWeight;
  if (netWeight.value !== undefined) normalized.netWeight = netWeight.value;
  return applicationSuccess(normalized);
}

function setString(target: ProductPatchPayload, key: keyof ProductPatchPayload, value: unknown): void {
  const normalized = stringOptional(value);
  if (normalized !== undefined) (target as Record<string, unknown>)[key] = normalized;
}

function nonNegativeNumberOptional(value: unknown, field: string): { ok: true; value?: number } | ApplicationFailureResult {
  if (value === undefined || value === null || value === '') return { ok: true };
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return validationError(`${field} deve ser número não negativo`, field);
  return { ok: true, value: number };
}

function stringOptional(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function toProductResponse(product: ProductRecord): ProductResponse {
  return { ...product, createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString() };
}

function validationError(message: string, field: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, message, { field });
}

function findOutOfScopeField(payload: ProductPayload): string | null {
  for (const field of Object.keys(payload)) {
    if (OUT_OF_SCOPE_FIELDS.has(field)) return field;
  }
  return null;
}

function productNotFound(productId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.PRODUCT_NOT_FOUND, 'Produto não encontrado', { productId });
}

function forbidden() {
  return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Ação não permitida');
}

function mapPersistenceError(error: unknown): ApplicationResult<ProductResponse> {
  if (isUniqueViolation(error)) {
    return applicationFailure(APPLICATION_ERROR_CODES.DUPLICATE_PRODUCT_SKU, 'Produto já existe para este SKU no escopo', { fields: ['sku'] });
  }
  if (isForeignKeyViolation(error)) {
    return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Referência inválida para produto', { fields: ['represented_company_id', 'category_id', 'unit_id'] });
  }
  throw error;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23503';
}

function isSupportedProductRole(role: AccessContext['role']): role is 'ADMIN' | 'REPRESENTANTE' {
  return role === 'ADMIN' || role === 'REPRESENTANTE';
}
