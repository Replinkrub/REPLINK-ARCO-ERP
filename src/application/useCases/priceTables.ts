import { randomUUID } from 'node:crypto';
import type { AccessContext } from '../../domain/ownership.js';
import { APPLICATION_ERROR_CODES } from '../errors.js';
import type { PriceTableRecord, PriceTableRepository, PriceTableStatus } from '../ports/priceTableRepository.js';
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../result.js';

export interface PriceTablePayload {
  [key: string]: unknown;
  id?: unknown;
  representedCompanyId?: unknown;
  represented_company_id?: unknown;
  name?: unknown;
  currency?: unknown;
  validFrom?: unknown;
  valid_from?: unknown;
  validUntil?: unknown;
  valid_until?: unknown;
  status?: unknown;
}

type PriceTablePatchPayload = Partial<Omit<PriceTableRecord, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>;

const OUT_OF_SCOPE_FIELDS = new Set([
  'items',
  'item',
  'price_table_items',
  'priceTableItems',
  'price_table_item',
  'product',
  'products',
  'product_id',
  'productId',
  'unit_price',
  'unitPrice',
  'payment_term',
  'payment_terms',
  'payment_term_id',
  'paymentTermId',
  'customer_commercial_profile',
  'default_price_table_id',
  'quote',
  'order',
  'commercial_document',
  'stock',
  'inventory',
]);

export interface PriceTableResponse {
  id: string;
  tenantId: string;
  representedCompanyId?: string;
  name: string;
  currency: string;
  validFrom: string;
  validUntil?: string;
  status: PriceTableStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PriceTableListResponse {
  items: PriceTableResponse[];
  page: number;
  pageSize: number;
  total: number;
}

export async function listPriceTablesUseCase(
  deps: { priceTableRepository: PriceTableRepository },
  input: { actor: AccessContext; page?: number; pageSize?: number; q?: string }
): Promise<ApplicationResult<PriceTableListResponse>> {
  if (!isSupportedPriceTableRole(input.actor.role)) return forbidden();
  const page = normalizePositiveInteger(input.page, 1);
  const pageSize = Math.min(normalizePositiveInteger(input.pageSize, 20), 100);
  const result = await deps.priceTableRepository.list({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    page,
    pageSize,
    q: input.q?.trim() || undefined,
  });
  return applicationSuccess({ items: result.items.map(toPriceTableResponse), page: result.page, pageSize: result.pageSize, total: result.total });
}

export async function getPriceTableUseCase(
  deps: { priceTableRepository: PriceTableRepository },
  input: { actor: AccessContext; priceTableId: string }
): Promise<ApplicationResult<PriceTableResponse>> {
  if (!isSupportedPriceTableRole(input.actor.role)) return forbidden();
  const priceTable = await deps.priceTableRepository.getById({
    tenantId: input.actor.actorTenantId,
    actorId: input.actor.actorId,
    role: input.actor.role,
    priceTableId: input.priceTableId,
  });
  if (!priceTable) return priceTableNotFound(input.priceTableId);
  return applicationSuccess(toPriceTableResponse(priceTable));
}

export async function createPriceTableUseCase(
  deps: { priceTableRepository: PriceTableRepository },
  input: { actor: AccessContext; payload: PriceTablePayload; now?: Date }
): Promise<ApplicationResult<PriceTableResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR8B1', outOfScopeField);
  const normalized = normalizePriceTablePayload(input.payload, true);
  if (!normalized.ok) return normalized;
  try {
    const priceTable = await deps.priceTableRepository.create({
      id: stringOptional(input.payload.id) ?? randomUUID(),
      tenantId: input.actor.actorTenantId,
      ...normalized.data,
      currency: normalized.data.currency ?? 'BRL',
      status: normalized.data.status ?? 'active',
      now: input.now,
    });
    return applicationSuccess(toPriceTableResponse(priceTable));
  } catch (error) {
    return mapPersistenceError(error);
  }
}

export async function updatePriceTableUseCase(
  deps: { priceTableRepository: PriceTableRepository },
  input: { actor: AccessContext; priceTableId: string; payload: PriceTablePayload; now?: Date }
): Promise<ApplicationResult<PriceTableResponse>> {
  if (input.actor.role !== 'ADMIN') return forbidden();
  const outOfScopeField = findOutOfScopeField(input.payload);
  if (outOfScopeField) return validationError('Campo fora do escopo do PR8B1', outOfScopeField);
  const normalized = normalizePriceTablePayload(input.payload, false);
  if (!normalized.ok) return normalized;
  try {
    const priceTable = await deps.priceTableRepository.update({
      tenantId: input.actor.actorTenantId,
      actorId: input.actor.actorId,
      role: input.actor.role,
      priceTableId: input.priceTableId,
      patch: normalized.data,
      now: input.now,
    });
    if (!priceTable) return priceTableNotFound(input.priceTableId);
    return applicationSuccess(toPriceTableResponse(priceTable));
  } catch (error) {
    return mapPersistenceError(error);
  }
}

function normalizePriceTablePayload(payload: PriceTablePayload, requireCore: true): ApplicationResult<PriceTablePatchPayload & Pick<PriceTableRecord, 'name' | 'validFrom'>>;
function normalizePriceTablePayload(payload: PriceTablePayload, requireCore: false): ApplicationResult<PriceTablePatchPayload>;
function normalizePriceTablePayload(payload: PriceTablePayload, requireCore: boolean): ApplicationResult<PriceTablePatchPayload> {
  const name = stringOptional(payload.name);
  const currency = stringOptional(payload.currency);
  const validFrom = dateStringOptional(payload.validFrom ?? payload.valid_from, 'valid_from');
  if (!validFrom.ok) return validFrom;
  const validUntil = dateStringOptional(payload.validUntil ?? payload.valid_until, 'valid_until');
  if (!validUntil.ok) return validUntil;
  const status = stringOptional(payload.status);
  if (requireCore && !name) return validationError('name é obrigatório', 'name');
  if (requireCore && !validFrom.value) return validationError('valid_from é obrigatório', 'valid_from');
  if (status !== undefined && status !== 'active' && status !== 'inactive') return validationError('status inválido', 'status');
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) return validationError('currency inválida', 'currency');
  if (validFrom.value && validUntil.value && validUntil.value < validFrom.value) return validationError('valid_until deve ser maior ou igual a valid_from', 'valid_until');

  const normalized: PriceTablePatchPayload = {};
  if (name !== undefined) normalized.name = name;
  if (currency !== undefined) normalized.currency = currency;
  if (validFrom.value !== undefined) normalized.validFrom = validFrom.value;
  if (validUntil.value !== undefined) normalized.validUntil = validUntil.value;
  if (status !== undefined) normalized.status = status as PriceTableStatus;
  setString(normalized, 'representedCompanyId', payload.representedCompanyId ?? payload.represented_company_id);
  return applicationSuccess(normalized);
}

function setString(target: PriceTablePatchPayload, key: keyof PriceTablePatchPayload, value: unknown): void {
  const normalized = stringOptional(value);
  if (normalized !== undefined) (target as Record<string, unknown>)[key] = normalized;
}

function dateStringOptional(value: unknown, field: string): { ok: true; value?: string } | ReturnType<typeof validationError> {
  const normalized = stringOptional(value);
  if (normalized === undefined) return { ok: true };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return validationError(`${field} deve usar formato YYYY-MM-DD`, field);
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return validationError(`${field} inválida`, field);
  return { ok: true, value: normalized };
}

function stringOptional(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function toPriceTableResponse(priceTable: PriceTableRecord): PriceTableResponse {
  return { ...priceTable, createdAt: priceTable.createdAt.toISOString(), updatedAt: priceTable.updatedAt.toISOString() };
}

function validationError(message: string, field: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, message, { field });
}

function findOutOfScopeField(payload: PriceTablePayload): string | null {
  for (const field of Object.keys(payload)) {
    if (OUT_OF_SCOPE_FIELDS.has(field)) return field;
  }
  return null;
}

function priceTableNotFound(priceTableId: string) {
  return applicationFailure(APPLICATION_ERROR_CODES.PRICE_TABLE_NOT_FOUND, 'Tabela de preço não encontrada', { priceTableId });
}

function forbidden() {
  return applicationFailure(APPLICATION_ERROR_CODES.FORBIDDEN, 'Ação não permitida');
}

function mapPersistenceError(error: unknown): ApplicationResult<PriceTableResponse> {
  if (isUniqueViolation(error)) return applicationFailure(APPLICATION_ERROR_CODES.DUPLICATE_PRICE_TABLE, 'Tabela de preço já existe neste escopo', { fields: ['name'] });
  if (isForeignKeyViolation(error)) return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Referência inválida para tabela de preço', { fields: ['represented_company_id'] });
  if (isCheckViolation(error)) return applicationFailure(APPLICATION_ERROR_CODES.VALIDATION_ERROR, 'Dados inválidos para tabela de preço', { fields: ['status', 'valid_until'] });
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

function isSupportedPriceTableRole(role: AccessContext['role']): role is 'ADMIN' | 'REPRESENTANTE' {
  return role === 'ADMIN' || role === 'REPRESENTANTE';
}
