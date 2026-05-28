import { canAccessRecord, type AccessContext } from './ownership.js';
import { validateAdjustmentReason, validateCancelReason } from './reasons.js';
import { applyTransition } from './stateMachine.js';
import type { AdjustmentReason, CancelReason, CommercialStatus, OutputEventChannel } from './types.js';

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

interface OperationSuccess {
  ok: true;
  document: CommercialDocument;
}

interface OperationFailure {
  ok: false;
  error: string;
}

export type OperationResult = OperationSuccess | OperationFailure;

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
  const mutation = ensureDraft(document);
  if (mutation) return mutation;
  if (document.items.some((existing) => existing.id === item.id)) return fail('Item já existe no documento');
  if (item.quantity <= 0) return fail('Quantidade deve ser maior que zero');
  if (item.unitPrice < 0) return fail('Preço unitário não pode ser negativo');

  try {
    const builtItem = buildItem(item);
    const next = { ...document, items: [...document.items, builtItem] };
    return ok(recalculate(next));
  } catch (error) {
    return fail((error as Error).message);
  }
}

export function removeItem(document: CommercialDocument, itemId: string): OperationResult {
  const mutation = ensureDraft(document);
  if (mutation) return mutation;

  const items = document.items.filter((item) => item.id !== itemId);
  if (items.length === document.items.length) return fail('Item não encontrado');

  return ok(recalculate({ ...document, items }));
}

export interface UpdateItemInput {
  quantity?: number;
  unitPrice?: number;
  discount?: number;
}

export function updateItem(document: CommercialDocument, itemId: string, patch: UpdateItemInput): OperationResult {
  const mutation = ensureDraft(document);
  if (mutation) return mutation;

  let found = false;
  try {
    const items = document.items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;

    const quantity = patch.quantity ?? item.quantity;
    const unitPrice = patch.unitPrice ?? item.unitPrice;
    const discount = patch.discount ?? item.discount;

      if (quantity <= 0) throw new Error('Quantidade deve ser maior que zero');
      if (unitPrice < 0) throw new Error('Preço unitário não pode ser negativo');

      return buildItem({ ...item, quantity, unitPrice, discount });
    });

    if (!found) return fail('Item não encontrado');

    return ok(recalculate({ ...document, items }));
  } catch (error) {
    return fail((error as Error).message);
  }
}

export function confirmQuote(document: CommercialDocument, actor: AccessContext, now = new Date()): OperationResult {
  const access = ensureAccess(document, actor);
  if (access) return access;

  const transition = applyTransition({ current: document.status, action: 'CONFIRM_ORDER', role: actor.role });
  if (!transition.allowed) return fail(transition.reason ?? 'Transição inválida');

  return ok({ ...document, status: transition.next, confirmedAt: now, updatedAt: now });
}

export function cancelDocument(
  document: CommercialDocument,
  actor: AccessContext,
  reason: CancelReason,
  note?: string,
  now = new Date()
): OperationResult {
  const access = ensureAccess(document, actor);
  if (access) return access;

  const reasonValidation = validateCancelReason(reason, note);
  if (!reasonValidation.valid) return fail(reasonValidation.error ?? 'Motivo inválido');

  const transition = applyTransition({ current: document.status, action: 'CANCEL', role: actor.role });
  if (!transition.allowed) return fail(transition.reason ?? 'Transição inválida');

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
  const access = ensureAccess(document, actor);
  if (access) return access;

  const reasonValidation = validateAdjustmentReason(reason, note);
  if (!reasonValidation.valid) return fail(reasonValidation.error ?? 'Motivo inválido');

  const transition = applyTransition({ current: document.status, action: 'ADMIN_ADJUST', role: actor.role });
  if (!transition.allowed) return fail(transition.reason ?? 'Transição inválida');

  const lifecycleEvents = [...document.lifecycleEvents, buildLifecycleEvent('ORDER_ADJUSTED', actor, now, { reason, note })];
  return ok({ ...document, status: transition.next, lifecycleEvents, updatedAt: now });
}

export function invoiceOrder(
  document: CommercialDocument,
  actor: AccessContext,
  manualReference?: string,
  now = new Date()
): OperationResult {
  const access = ensureAccess(document, actor);
  if (access) return access;

  const transition = applyTransition({ current: document.status, action: 'INVOICE', role: actor.role });
  if (!transition.allowed) return fail(transition.reason ?? 'Transição inválida');

  const lifecycleEvents = [
    ...document.lifecycleEvents,
    buildLifecycleEvent('ORDER_INVOICED', actor, now, { manualReference }),
  ];

  return ok({
    ...document,
    status: transition.next,
    invoicedAt: now,
    invoiceManualReference: manualReference,
    lifecycleEvents,
    updatedAt: now,
  });
}

export function registerOutputEvent(
  document: CommercialDocument,
  actor: AccessContext,
  channel: OutputEventChannel,
  event: string,
  now = new Date()
): OperationResult {
  const access = ensureAccess(document, actor);
  if (access) return access;

  const lifecycleEvents = [
    ...document.lifecycleEvents,
    buildLifecycleEvent('OUTPUT_EVENT_REGISTERED', actor, now, { channel, event }),
  ];

  return ok({ ...document, lifecycleEvents, updatedAt: now });
}

function buildItem(item: AddItemInput): CommercialDocumentItem {
  const discount = item.discount ?? 0;
  if (discount < 0) throw new Error('Desconto não pode ser negativo');

  const subtotal = item.quantity * item.unitPrice;
  if (discount > subtotal) throw new Error('Desconto não pode exceder subtotal do item');

  return {
    id: item.id,
    sku: item.sku,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount,
    total: subtotal - discount,
  };
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

  return { ...document, totals, updatedAt: new Date() };
}

function ensureDraft(document: CommercialDocument): OperationFailure | null {
  if (document.status !== 'QUOTE_DRAFT') {
    return fail('Itens só podem ser alterados em QUOTE_DRAFT');
  }
  return null;
}

function ensureAccess(document: CommercialDocument, actor: AccessContext): OperationFailure | null {
  const allowed = canAccessRecord(actor, { tenantId: document.tenantId, representativeId: document.representativeId });
  return allowed ? null : fail('Acesso negado à carteira/tenant do documento');
}

function emptyTotals(): CommercialDocumentTotals {
  return { itemsCount: 0, subtotal: 0, discountTotal: 0, total: 0 };
}

function ok(document: CommercialDocument): OperationSuccess {
  return { ok: true, document };
}

function fail(error: string): OperationFailure {
  return { ok: false, error };
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
