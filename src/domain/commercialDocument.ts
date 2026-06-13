import { canAccessRecord, type AccessContext } from './ownership.js';
import { DOMAIN_ERROR_CODES } from './validation.js';
import { validateAdjustmentReason, validateCancelReason } from './reasons.js';
import { applyTransition } from './stateMachine.js';
import type {
  AdjustmentReason,
  CancelReason,
  CommercialDocumentType,
  CommercialStatus,
  OutputEventChannel,
} from './types.js';
import { domainError, failure, success, type DomainEvent, type DomainResult } from './validation.js';

export interface CommercialDocumentItem {
  id: string;
  productId?: string;
  representedCompanyId?: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  lineTotal?: number;
  priceSource?: 'CUSTOMER_PRODUCT_OVERRIDE' | 'PRICE_TABLE_ITEM';
  priceSourceId?: string;
  priceTableId?: string;
  priceResolvedAt?: string;
}

export interface CommercialDocumentTotals {
  itemsCount: number;
  subtotal: number;
  discountTotal: number;
  total: number;
}

export interface CommercialDocumentSourceItemSnapshot {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  total: number;
}

export interface CommercialDocumentSourceTotalsSnapshot {
  subtotal: number;
  discountTotal?: number;
  tax?: number;
  freight?: number;
  fees?: number;
  total: number;
}

export interface CommercialDocumentSourceQuoteSnapshot {
  source_quote_id: string;
  source_quote_number: string;
  source_quote_revision?: string | number;
  represented_company_id?: string;
  customerId?: string;
  ownerId: string;
  representativeId: string;
  converted_at: Date;
  items: CommercialDocumentSourceItemSnapshot[];
  totals: CommercialDocumentSourceTotalsSnapshot;
}

export interface CommercialDocument {
  id: string;
  documentType: CommercialDocumentType;
  number: string;
  tenantId: string;
  representedCompanyId?: string;
  customerId?: string;
  ownerId: string;
  representativeId: string;
  status: CommercialStatus;
  items: CommercialDocumentItem[];
  totals: CommercialDocumentTotals;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt?: Date;
  invoicedAt?: Date;
  invoiceManualReference?: string;
  source_quote_id?: string;
  source_quote_number?: string;
  source_quote_revision?: string | number;
  converted_at?: Date;
  sourceQuoteSnapshot?: CommercialDocumentSourceQuoteSnapshot;
  canceledAt?: Date;
  cancelReason?: CancelReason;
  cancelNote?: string;
  lifecycleEvents: CommercialDocumentLifecycleEvent[];
  outputEvents: CommercialDocumentOutputEvent[];
  orderRevisions: CommercialDocumentOrderRevision[];
}

export interface CommercialDocumentLifecycleEvent {
  type: 'ORDER_ADJUSTED' | 'ORDER_INVOICED';
  at: Date;
  actorId: string;
  role: AccessContext['role'];
  reason?: AdjustmentReason;
  note?: string;
  revisionNumber?: number;
  manualReference?: string;
}

export interface CommercialDocumentOutputEvent {
  type: 'OUTPUT_EVENT_REGISTERED';
  at: Date;
  actorId: string;
  role: AccessContext['role'];
  channel?: OutputEventChannel;
  event?: string;
}

export interface CommercialDocumentOrderRevisionPayload {
  status: CommercialStatus;
  items: CommercialDocumentItem[];
  totals: CommercialDocumentTotals;
}

export interface CommercialDocumentOrderRevision {
  revisionNumber: number;
  reason: AdjustmentReason;
  note?: string;
  createdAt: Date;
  createdBy: string;
  beforePayload: CommercialDocumentOrderRevisionPayload;
  afterPayload: CommercialDocumentOrderRevisionPayload;
}

export interface CommercialDocumentAdminAdjustmentChanges {
  items?: CommercialDocumentItem[];
  totals?: Partial<CommercialDocumentTotals>;
}
export type OperationResult = DomainResult<CommercialDocument>;

export interface CreateQuoteInput {
  id: string;
  tenantId: string;
  representedCompanyId?: string;
  customerId?: string;
  ownerId: string;
  representativeId: string;
  numberSequence?: number;
  now?: Date;
}

export interface GenerateCommercialDocumentNumberInput {
  type: CommercialDocumentType;
  sequence: number;
}

const DOCUMENT_PREFIX: Record<CommercialDocumentType, 'ORC' | 'PED'> = {
  quote: 'ORC',
  order: 'PED',
};

const DOCUMENT_NUMBER_REGEX = /^(ORC|PED)-(\d{6})$/;

export function generateCommercialDocumentNumber(input: GenerateCommercialDocumentNumberInput): string {
  if (!Number.isInteger(input.sequence) || input.sequence <= 0) {
    throw new Error('Sequence must be a positive integer');
  }

  const prefix = DOCUMENT_PREFIX[input.type];
  return `${prefix}-${String(input.sequence).padStart(6, '0')}`;
}

export function validateCommercialDocumentNumber(number: string, type: CommercialDocumentType): DomainResult<string> {
  const parsed = DOCUMENT_NUMBER_REGEX.exec(number);
  if (!parsed) {
    return {
      ok: false,
      error: domainError(DOMAIN_ERROR_CODES.INVALID_DOCUMENT_NUMBER_FORMAT, 'Número deve seguir o formato ORC-000001/PED-000001'),
      events: [],
    };
  }

  const expectedPrefix = DOCUMENT_PREFIX[type];
  const receivedPrefix = parsed[1];
  if (expectedPrefix !== receivedPrefix) {
    return {
      ok: false,
      error: domainError(
        DOMAIN_ERROR_CODES.INVALID_DOCUMENT_NUMBER_TYPE,
        `Número ${number} incompatível com tipo ${type}`,
        { expectedPrefix, receivedPrefix }
      ),
      events: [],
    };
  }

  return success(number);
}

export function createQuote(input: CreateQuoteInput): CommercialDocument {
  const now = input.now ?? new Date();
  const number = generateCommercialDocumentNumber({ type: 'quote', sequence: input.numberSequence ?? 1 });
  return {
    id: input.id,
    documentType: 'quote',
    number,
    tenantId: input.tenantId,
    representedCompanyId: input.representedCompanyId,
    customerId: input.customerId,
    ownerId: input.ownerId,
    representativeId: input.representativeId,
    status: 'QUOTE_DRAFT',
    items: [],
    totals: emptyTotals(),
    createdAt: now,
    updatedAt: now,
    lifecycleEvents: [],
    outputEvents: [],
    orderRevisions: [],
  };
}

export function convertQuoteToOrder(
  quote: CommercialDocument,
  orderSequence: number,
  now = new Date()
): DomainResult<CommercialDocument> {
  if (quote.documentType === 'order' || quote.status === 'ORDER_CONFIRMED') {
    return failure({
      code: DOMAIN_ERROR_CODES.DOCUMENT_ALREADY_CONFIRMED,
      message: 'Documento já confirmado',
      at: now,
      operation: 'CONFIRM_ORDER',
      tenantId: quote.tenantId,
      documentId: quote.id,
      currentStatus: quote.status,
      withDeniedEvent: true,
    });
  }

  if (quote.documentType !== 'quote') {
    return failure({
      code: DOMAIN_ERROR_CODES.INVALID_DOCUMENT_NUMBER_TYPE,
      message: 'Apenas quote pode ser convertido para order',
      at: now,
      operation: 'CONFIRM_ORDER',
      tenantId: quote.tenantId,
      documentId: quote.id,
      currentStatus: quote.status,
    });
  }

  if (quote.status !== 'QUOTE_DRAFT') {
    return failure({
      code: DOMAIN_ERROR_CODES.INVALID_DOCUMENT_STATE,
      message: 'Somente quote em QUOTE_DRAFT pode ser convertido para order',
      at: now,
      operation: 'CONFIRM_ORDER',
      tenantId: quote.tenantId,
      documentId: quote.id,
      currentStatus: quote.status,
    });
  }

  const orderNumber = generateCommercialDocumentNumber({ type: 'order', sequence: orderSequence });
  const sourceQuoteSnapshot = buildSourceQuoteSnapshot(quote, now);
  return success({
    ...quote,
    id: buildOrderIdFromQuote(quote.id),
    documentType: 'order',
    number: orderNumber,
    source_quote_id: quote.id,
    source_quote_number: quote.number,
    source_quote_revision: sourceQuoteSnapshot.source_quote_revision,
    converted_at: now,
    sourceQuoteSnapshot,
    status: 'ORDER_CONFIRMED',
    confirmedAt: now,
    updatedAt: now,
  });
}

function buildOrderIdFromQuote(quoteId: string): string {
  return `${quoteId}:order`;
}

function buildSourceQuoteSnapshot(quote: CommercialDocument, convertedAt: Date): CommercialDocumentSourceQuoteSnapshot {
  const rawQuote = quote as CommercialDocument & Record<string, unknown>;
  const rawTotals = quote.totals as CommercialDocumentTotals & Record<string, unknown>;

  const snapshot: CommercialDocumentSourceQuoteSnapshot = {
    source_quote_id: quote.id,
    source_quote_number: quote.number,
    ownerId: quote.ownerId,
    representativeId: quote.representativeId,
    converted_at: new Date(convertedAt),
    items: quote.items.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      ...(item.discount !== undefined ? { discount: item.discount } : {}),
      total: item.total,
    })),
    totals: {
      subtotal: quote.totals.subtotal,
      ...(quote.totals.discountTotal !== undefined ? { discountTotal: quote.totals.discountTotal } : {}),
      ...pickOptionalNumber(rawTotals, 'tax'),
      ...pickOptionalNumber(rawTotals, 'freight'),
      ...pickOptionalNumber(rawTotals, 'fees'),
      total: quote.totals.total,
    },
  };

  if ('source_quote_revision' in rawQuote && (typeof rawQuote.source_quote_revision === 'string' || typeof rawQuote.source_quote_revision === 'number')) {
    snapshot.source_quote_revision = rawQuote.source_quote_revision;
  }

  if ('customerId' in rawQuote && typeof rawQuote.customerId === 'string') {
    snapshot.customerId = rawQuote.customerId;
  }

  if (quote.representedCompanyId) {
    snapshot.represented_company_id = quote.representedCompanyId;
  }

  return snapshot;
}

function pickOptionalNumber(source: Record<string, unknown>, key: 'tax' | 'freight' | 'fees'): Partial<Record<'tax' | 'freight' | 'fees', number>> {
  const value = source[key];
  return typeof value === 'number' ? { [key]: value } : {};
}

export interface AddItemInput {
  id: string;
  productId?: string;
  representedCompanyId?: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  priceSource?: 'CUSTOMER_PRODUCT_OVERRIDE' | 'PRICE_TABLE_ITEM';
  priceSourceId?: string;
  priceTableId?: string;
  priceResolvedAt?: string;
}

export function addItem(document: CommercialDocument, item: AddItemInput): OperationResult {
  const mutation = ensureMutableStatus(document, 'ADD_ITEM');
  if (mutation) return mutation;
  if (document.items.some((existing) => existing.id === item.id)) {
    return fail(document, 'ADD_ITEM', DOMAIN_ERROR_CODES.DUPLICATE_ITEM, 'Item já existe no documento');
  }

  const builtItem = buildItem(item);
  if (!builtItem.ok) return builtItem;

  const next = { ...document, items: [...document.items, builtItem.document] };
  return ok(recalculate(next));
}

export function removeItem(document: CommercialDocument, itemId: string): OperationResult {
  const mutation = ensureMutableStatus(document, 'REMOVE_ITEM');
  if (mutation) return mutation;

  const items = document.items.filter((item) => item.id !== itemId);
  if (items.length === document.items.length) {
    return fail(document, 'REMOVE_ITEM', DOMAIN_ERROR_CODES.ITEM_NOT_FOUND, 'Item não encontrado');
  }

  return ok(recalculate({ ...document, items }));
}

export interface UpdateItemInput {
  productId?: string;
  representedCompanyId?: string;
  sku?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discount?: number;
  priceSource?: 'CUSTOMER_PRODUCT_OVERRIDE' | 'PRICE_TABLE_ITEM';
  priceSourceId?: string;
  priceTableId?: string;
  priceResolvedAt?: string;
}

export function updateItem(document: CommercialDocument, itemId: string, patch: UpdateItemInput): OperationResult {
  const mutation = ensureMutableStatus(document, 'UPDATE_ITEM');
  if (mutation) return mutation;

  let found = false;
  const items = document.items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;

    const quantity = patch.quantity ?? item.quantity;
    const unitPrice = patch.unitPrice ?? item.unitPrice;
    const discount = patch.discount ?? item.discount;

    const built = buildItem({ ...item, ...patch, quantity, unitPrice, discount });
    if (!built.ok) return built;
    return built.document;
  });

  if (!found) return fail(document, 'UPDATE_ITEM', DOMAIN_ERROR_CODES.ITEM_NOT_FOUND, 'Item não encontrado');
  const invalid = items.find((item) => 'ok' in item);
  if (invalid && 'ok' in invalid && invalid.ok === false) return invalid;

  return ok(recalculate({ ...document, items: items as CommercialDocumentItem[] }));
}

function operationDeniedTransition(
  document: CommercialDocument,
  actor: AccessContext,
  operation: 'CONFIRM_ORDER' | 'CANCEL' | 'INVOICE' | 'ADMIN_ADJUST',
  message: string,
  code: keyof typeof DOMAIN_ERROR_CODES
): OperationResult {
  return failure({
    code: DOMAIN_ERROR_CODES[code],
    message,
    at: new Date(),
    operation,
    tenantId: document.tenantId,
    documentId: document.id,
    actorId: actor.actorId,
    role: actor.role,
    currentStatus: document.status,
    withDeniedEvent: true,
  });
}

export function confirmQuote(document: CommercialDocument, actor: AccessContext, now = new Date()): OperationResult {
  const access = ensureAccess(document, actor, 'CONFIRM_ORDER');
  if (access) return access;

  if (document.status === 'ORDER_CONFIRMED') {
    return operationDeniedTransition(document, actor, 'CONFIRM_ORDER', 'Documento já confirmado', 'DOCUMENT_ALREADY_CONFIRMED');
  }

  const transition = applyTransition({ current: document.status, action: 'CONFIRM_ORDER', role: actor.role });
  if (!transition.allowed) {
    return operationDeniedTransition(document, actor, 'CONFIRM_ORDER', transition.reason ?? 'Transição inválida', 'INVALID_DOCUMENT_STATE');
  }

  return ok({ ...document, status: transition.next, confirmedAt: now, updatedAt: now });
}

export function cancelDocument(
  document: CommercialDocument,
  actor: AccessContext,
  reason: CancelReason,
  note?: string,
  now = new Date()
): OperationResult {
  const access = ensureAccess(document, actor, 'CANCEL');
  if (access) return access;

  const reasonValidation = validateCancelReason(reason, note);
  if (!reasonValidation.valid) {
    return fail(document, 'CANCEL', DOMAIN_ERROR_CODES.INVALID_CANCEL_REASON, reasonValidation.error ?? 'Motivo inválido', actor);
  }

  if (document.status === 'CANCELED') {
    return operationDeniedTransition(document, actor, 'CANCEL', 'Documento já cancelado', 'DOCUMENT_ALREADY_CANCELLED');
  }

  const transition = applyTransition({ current: document.status, action: 'CANCEL', role: actor.role });
  if (!transition.allowed) {
    return operationDeniedTransition(document, actor, 'CANCEL', transition.reason ?? 'Transição inválida', 'INVALID_DOCUMENT_STATE');
  }

  return ok({
    ...document,
    status: transition.next,
    cancelReason: reason,
    cancelNote: note,
    canceledAt: now,
    updatedAt: now,
  });
}

export function adjustConfirmedOrder(
  document: CommercialDocument,
  actor: AccessContext,
  reason: AdjustmentReason,
  note?: string,
  changes?: CommercialDocumentAdminAdjustmentChanges,
  now = new Date()
): OperationResult {
  const access = ensureAccess(document, actor, 'ADMIN_ADJUST');
  if (access) return access;

  const reasonValidation = validateAdjustmentReason(reason, note);
  if (!reasonValidation.valid) {
    return fail(
      document,
      'ADMIN_ADJUST',
      DOMAIN_ERROR_CODES.INVALID_ADJUSTMENT_REASON,
      reasonValidation.error ?? 'Motivo inválido',
      actor
    );
  }

  const transition = applyTransition({ current: document.status, action: 'ADMIN_ADJUST', role: actor.role });
  if (!transition.allowed) {
    return operationDeniedTransition(document, actor, 'ADMIN_ADJUST', transition.reason ?? 'Transição inválida', 'INVALID_DOCUMENT_STATE');
  }

  const beforePayload = buildOrderRevisionPayload(document);
  const adjustedDocument = applyAdminAdjustmentChanges(document, changes, transition.next, now);
  const afterPayload = buildOrderRevisionPayload(adjustedDocument);

  if (sameOrderRevisionPayload(beforePayload, afterPayload)) {
    return fail(
      document,
      'ADMIN_ADJUST',
      DOMAIN_ERROR_CODES.INVALID_ADJUSTMENT_REASON,
      'Ajuste administrativo sem alteração efetiva',
      actor,
      true
    );
  }

  const nextRevisionNumber = getNextOrderRevisionNumber(document.orderRevisions);
  const revision = buildOrderRevision(actor, reason, note, nextRevisionNumber, now, beforePayload, afterPayload);

  const lifecycleEvent = buildLifecycleEvent('ORDER_ADJUSTED', actor, now, { reason, note, revisionNumber: nextRevisionNumber });
  const lifecycleEvents = [...adjustedDocument.lifecycleEvents, lifecycleEvent];
  return ok(
    {
      ...adjustedDocument,
      lifecycleEvents,
      orderRevisions: [...adjustedDocument.orderRevisions, revision],
    },
    [toDomainEvent(lifecycleEvent)]
  );
}

export function invoiceOrder(
  document: CommercialDocument,
  actor: AccessContext,
  manualReference?: string,
  now = new Date()
): OperationResult {
  const access = ensureAccess(document, actor, 'INVOICE');
  if (access) return access;

  if (document.status === 'INVOICED') {
    return operationDeniedTransition(document, actor, 'INVOICE', 'Documento já faturado', 'DOCUMENT_ALREADY_INVOICED');
  }

  const transition = applyTransition({ current: document.status, action: 'INVOICE', role: actor.role });
  if (!transition.allowed) {
    const code = document.status !== 'ORDER_CONFIRMED' ? 'INVOICE_NOT_ALLOWED' : 'INVALID_DOCUMENT_STATE';
    return operationDeniedTransition(document, actor, 'INVOICE', transition.reason ?? 'Transição inválida', code);
  }

  const lifecycleEvents = [
    ...document.lifecycleEvents,
    buildLifecycleEvent('ORDER_INVOICED', actor, now, { manualReference }),
  ];

  const nextDocument = {
    ...document,
    status: transition.next,
    invoicedAt: now,
    invoiceManualReference: manualReference,
    lifecycleEvents,
    updatedAt: now,
  };
  return ok(nextDocument, [toDomainEvent(lifecycleEvents.at(-1) as CommercialDocumentLifecycleEvent)]);
}

export function registerOutputEvent(
  document: CommercialDocument,
  actor: AccessContext,
  channel: OutputEventChannel,
  event: string,
  now = new Date()
): OperationResult {
  const access = ensureAccess(document, actor, 'ADMIN_ADJUST');
  if (access) return access;

  const outputEvent = buildOutputEvent(actor, now, channel, event);
  return ok(
    {
      ...document,
      outputEvents: [...document.outputEvents, outputEvent],
      updatedAt: now,
    },
    [toDomainEvent(outputEvent)]
  );
}

function buildItem(item: AddItemInput): DomainResult<CommercialDocumentItem> {
  const discount = item.discount ?? 0;
  if (item.quantity <= 0) {
    return failItem(DOMAIN_ERROR_CODES.INVALID_ITEM_QUANTITY, 'Quantidade deve ser maior que zero');
  }
  if (item.unitPrice < 0) {
    return failItem(DOMAIN_ERROR_CODES.INVALID_ITEM_PRICE, 'Preço unitário não pode ser negativo');
  }
  if (discount < 0) {
    return failItem(DOMAIN_ERROR_CODES.INVALID_DISCOUNT, 'Desconto não pode ser negativo');
  }

  const subtotal = item.quantity * item.unitPrice;
  if (discount > subtotal) {
    return failItem(DOMAIN_ERROR_CODES.INVALID_DISCOUNT, 'Desconto não pode exceder subtotal do item');
  }

  return success({
    id: item.id,
    ...(item.productId ? { productId: item.productId } : {}),
    ...(item.representedCompanyId ? { representedCompanyId: item.representedCompanyId } : {}),
    sku: item.sku,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount,
    total: subtotal - discount,
    lineTotal: subtotal - discount,
    ...(item.priceSource ? { priceSource: item.priceSource } : {}),
    ...(item.priceSourceId ? { priceSourceId: item.priceSourceId } : {}),
    ...(item.priceTableId ? { priceTableId: item.priceTableId } : {}),
    ...(item.priceResolvedAt ? { priceResolvedAt: item.priceResolvedAt } : {}),
  });
}

function failItem(
  code: (typeof DOMAIN_ERROR_CODES)[keyof typeof DOMAIN_ERROR_CODES],
  message: string
): DomainResult<CommercialDocumentItem> {
  return { ok: false, error: domainError(code, message), events: [] };
}

function recalculate(document: CommercialDocument): CommercialDocument {
  const totals = document.items.reduce(
    (acc, item) => ({
      itemsCount: acc.itemsCount + 1,
      subtotal: acc.subtotal + item.quantity * item.unitPrice,
      discountTotal: acc.discountTotal + item.discount,
      total: acc.total + item.total,
    }),
    emptyTotals()
  );

  if (totals.total < 0) {
    return { ...document, totals: { ...totals, total: 0 }, updatedAt: new Date() };
  }
  return { ...document, totals, updatedAt: new Date() };
}

function ensureMutableStatus(
  document: CommercialDocument,
  operation: 'ADD_ITEM' | 'UPDATE_ITEM' | 'REMOVE_ITEM'
): OperationResult | null {
  if (document.status === 'CANCELED' || document.status === 'INVOICED') {
    return failure({
      code: DOMAIN_ERROR_CODES.OPERATION_DENIED,
      message: 'Documento não aceita mutação neste estado',
      at: new Date(),
      operation,
      tenantId: document.tenantId,
      documentId: document.id,
      currentStatus: document.status,
      withDeniedEvent: true,
    });
  }
  if (document.status !== 'QUOTE_DRAFT') {
    return fail(
      document,
      operation,
      DOMAIN_ERROR_CODES.INVALID_DOCUMENT_STATE,
      'Itens só podem ser alterados em QUOTE_DRAFT',
      undefined,
      true
    );
  }
  return null;
}

function ensureAccess(
  document: CommercialDocument,
  actor: AccessContext,
  operation: 'CONFIRM_ORDER' | 'CANCEL' | 'INVOICE' | 'ADMIN_ADJUST'
): OperationResult | null {
  if (actor.actorTenantId !== document.tenantId) {
    return fail(document, operation, DOMAIN_ERROR_CODES.TENANT_MISMATCH, 'Tenant do ator não confere com documento', actor, true);
  }
  const allowed = canAccessRecord(actor, { tenantId: document.tenantId, representativeId: document.representativeId });
  return allowed
    ? null
    : fail(document, operation, DOMAIN_ERROR_CODES.OWNERSHIP_DENIED, 'Acesso negado à carteira do documento', actor, true);
}

function emptyTotals(): CommercialDocumentTotals {
  return { itemsCount: 0, subtotal: 0, discountTotal: 0, total: 0 };
}

function ok(document: CommercialDocument, events: DomainEvent[] = []): OperationResult {
  return success(document, events);
}

function fail(
  document: CommercialDocument,
  operation: 'CONFIRM_ORDER' | 'CANCEL' | 'INVOICE' | 'ADMIN_ADJUST' | 'ADD_ITEM' | 'UPDATE_ITEM' | 'REMOVE_ITEM',
  code: (typeof DOMAIN_ERROR_CODES)[keyof typeof DOMAIN_ERROR_CODES],
  message: string,
  actor?: AccessContext,
  withDeniedEvent = false
): OperationResult {
  return failure({
    code,
    message,
    at: new Date(),
    operation,
    tenantId: document.tenantId,
    documentId: document.id,
    actorId: actor?.actorId,
    role: actor?.role,
    currentStatus: document.status,
    withDeniedEvent,
  });
}

function buildLifecycleEvent(
  type: CommercialDocumentLifecycleEvent['type'],
  actor: AccessContext,
  at: Date,
  extra?: Partial<CommercialDocumentLifecycleEvent>
): CommercialDocumentLifecycleEvent {
  return {
    type,
    at,
    actorId: actor.actorId,
    role: actor.role,
    ...extra,
  };
}

function toDomainEvent(event: CommercialDocumentLifecycleEvent | CommercialDocumentOutputEvent): DomainEvent {
  const lifecyclePayload = {
    reason: 'reason' in event ? event.reason : undefined,
    note: 'note' in event ? event.note : undefined,
    revisionNumber: 'revisionNumber' in event ? event.revisionNumber : undefined,
    manualReference: 'manualReference' in event ? event.manualReference : undefined,
  };
  const outputPayload = {
    channel: 'channel' in event ? event.channel : undefined,
    event: 'event' in event ? event.event : undefined,
  };

  return {
    type: event.type,
    at: event.at,
    payload: {
      actorId: event.actorId,
      role: event.role,
      ...lifecyclePayload,
      ...outputPayload,
    },
  };
}

function buildOutputEvent(actor: AccessContext, at: Date, channel: OutputEventChannel, event: string): CommercialDocumentOutputEvent {
  return {
    type: 'OUTPUT_EVENT_REGISTERED',
    at,
    actorId: actor.actorId,
    role: actor.role,
    channel,
    event,
  };
}

function buildOrderRevision(
  actor: AccessContext,
  reason: AdjustmentReason,
  note: string | undefined,
  revisionNumber: number,
  createdAt: Date,
  beforePayload: CommercialDocumentOrderRevisionPayload,
  afterPayload: CommercialDocumentOrderRevisionPayload
): CommercialDocumentOrderRevision {
  return {
    revisionNumber,
    reason,
    note,
    createdAt,
    createdBy: actor.actorId,
    beforePayload,
    afterPayload,
  };
}

function applyAdminAdjustmentChanges(
  document: CommercialDocument,
  changes: CommercialDocumentAdminAdjustmentChanges | undefined,
  nextStatus: CommercialStatus,
  updatedAt: Date
): CommercialDocument {
  const nextItems = changes?.items
    ? changes.items.map((item) => ({ ...item }))
    : document.items.map((item) => ({ ...item }));

  const nextTotals = changes?.totals ? { ...document.totals, ...changes.totals } : { ...document.totals };

  return {
    ...document,
    status: nextStatus,
    items: nextItems,
    totals: nextTotals,
    updatedAt,
  };
}

function sameOrderRevisionPayload(
  left: CommercialDocumentOrderRevisionPayload,
  right: CommercialDocumentOrderRevisionPayload
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getNextOrderRevisionNumber(revisions: CommercialDocumentOrderRevision[]): number {
  const maxRevision = revisions.reduce((max, revision) => Math.max(max, revision.revisionNumber), 0);
  return maxRevision + 1;
}

function buildOrderRevisionPayload(document: CommercialDocument): CommercialDocumentOrderRevisionPayload {
  return {
    status: document.status,
    items: document.items.map((item) => ({ ...item })),
    totals: { ...document.totals },
  };
}
