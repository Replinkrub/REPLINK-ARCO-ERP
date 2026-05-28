import { canAccessRecord, type AccessContext } from './ownership.js';
import { DOMAIN_ERROR_CODES } from './validation.js';
import { validateAdjustmentReason, validateCancelReason } from './reasons.js';
import { applyTransition } from './stateMachine.js';
import type { AdjustmentReason, CancelReason, CommercialStatus, OutputEventChannel } from './types.js';
import { domainError, failure, success, type DomainEvent, type DomainResult } from './validation.js';

export interface CommercialDocumentItem {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface CommercialDocumentTotals {
  itemsCount: number;
  subtotal: number;
  discountTotal: number;
  total: number;
}

export interface CommercialDocument {
  id: string;
  tenantId: string;
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
  canceledAt?: Date;
  cancelReason?: CancelReason;
  cancelNote?: string;
  lifecycleEvents: CommercialDocumentLifecycleEvent[];
}

export interface CommercialDocumentLifecycleEvent {
  type: 'ORDER_ADJUSTED' | 'ORDER_INVOICED' | 'OUTPUT_EVENT_REGISTERED';
  at: Date;
  actorId: string;
  role: AccessContext['role'];
  reason?: AdjustmentReason;
  note?: string;
  manualReference?: string;
  channel?: OutputEventChannel;
  event?: string;
}
export type OperationResult = DomainResult<CommercialDocument>;

export interface CreateQuoteInput {
  id: string;
  tenantId: string;
  ownerId: string;
  representativeId: string;
  now?: Date;
}

export function createQuote(input: CreateQuoteInput): CommercialDocument {
  const now = input.now ?? new Date();
  return {
    id: input.id,
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    representativeId: input.representativeId,
    status: 'QUOTE_DRAFT',
    items: [],
    totals: emptyTotals(),
    createdAt: now,
    updatedAt: now,
    lifecycleEvents: [],
  };
}

export interface AddItemInput {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
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
  quantity?: number;
  unitPrice?: number;
  discount?: number;
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

    const built = buildItem({ ...item, quantity, unitPrice, discount });
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

  const lifecycleEvent = buildLifecycleEvent('ORDER_ADJUSTED', actor, now, { reason, note });
  const lifecycleEvents = [...document.lifecycleEvents, lifecycleEvent];
  return ok({ ...document, status: transition.next, lifecycleEvents, updatedAt: now }, [toDomainEvent(lifecycleEvent)]);
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

  const lifecycleEvent = buildLifecycleEvent('OUTPUT_EVENT_REGISTERED', actor, now, { channel, event });
  return ok({ ...document, lifecycleEvents: [...document.lifecycleEvents, lifecycleEvent], updatedAt: now }, [toDomainEvent(lifecycleEvent)]);
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
    sku: item.sku,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount,
    total: subtotal - discount,
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

function toDomainEvent(event: CommercialDocumentLifecycleEvent): DomainEvent {
  return {
    type: event.type,
    at: event.at,
    payload: {
      actorId: event.actorId,
      role: event.role,
      reason: event.reason,
      note: event.note,
      manualReference: event.manualReference,
      channel: event.channel,
      event: event.event,
    },
  };
}
