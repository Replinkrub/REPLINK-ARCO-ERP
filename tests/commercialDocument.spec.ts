import { describe, expect, it } from 'vitest';
import { addItem, cancelDocument, confirmQuote, createQuote, removeItem, updateItem, type AccessContext } from '../src/index.js';

const repContext: AccessContext = {
  role: 'REPRESENTANTE',
  actorId: 'rep-1',
  actorTenantId: 'tenant-1',
};

describe('commercialDocument core', () => {
  it('criar orçamento válido', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    expect(doc.status).toBe('QUOTE_DRAFT');
    expect(doc.items).toHaveLength(0);
    expect(doc.totals.total).toBe(0);
  });

  it('adicionar item e calcular total', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = addItem(doc, { id: 'i1', sku: 'SKU-1', description: 'Item 1', quantity: 2, unitPrice: 100, discount: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.totals.subtotal).toBe(200);
      expect(result.document.totals.discountTotal).toBe(10);
      expect(result.document.totals.total).toBe(190);
    }
  });

  it('bloquear addItem com id duplicado', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const first = addItem(doc, { id: 'i1', sku: 'SKU-1', description: 'Item 1', quantity: 1, unitPrice: 100 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const duplicated = addItem(first.document, { id: 'i1', sku: 'SKU-2', description: 'Item 2', quantity: 1, unitPrice: 50 });
    expect(duplicated.ok).toBe(false);
  });

  it('bloquear desconto negativo no addItem', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = addItem(doc, { id: 'i1', sku: 'SKU-1', description: 'Item 1', quantity: 1, unitPrice: 100, discount: -1 });
    expect(result.ok).toBe(false);
  });

  it('bloquear desconto maior que subtotal no addItem', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = addItem(doc, { id: 'i1', sku: 'SKU-1', description: 'Item 1', quantity: 1, unitPrice: 100, discount: 101 });
    expect(result.ok).toBe(false);
  });

  it('remover item e recalcular total', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const withA = addItem(doc, { id: 'a', sku: 'A', description: 'A', quantity: 1, unitPrice: 100 });
    const withB = withA.ok
      ? addItem(withA.document, { id: 'b', sku: 'B', description: 'B', quantity: 2, unitPrice: 50 })
      : withA;

    expect(withB.ok).toBe(true);
    if (!withB.ok) return;

    const removed = removeItem(withB.document, 'a');
    expect(removed.ok).toBe(true);
    if (removed.ok) {
      expect(removed.document.items).toHaveLength(1);
      expect(removed.document.totals.total).toBe(100);
    }
  });

  it('bloquear removeItem para item inexistente', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = removeItem(doc, 'missing');
    expect(result.ok).toBe(false);
  });

  it('ajustar quantidade/preço/desconto básico e recalcular total', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const withItem = addItem(doc, { id: 'i1', sku: 'SKU-1', description: 'Item 1', quantity: 2, unitPrice: 100, discount: 10 });

    expect(withItem.ok).toBe(true);
    if (!withItem.ok) return;

    const adjusted = updateItem(withItem.document, 'i1', { quantity: 3, unitPrice: 120, discount: 20 });
    expect(adjusted.ok).toBe(true);
    if (adjusted.ok) {
      expect(adjusted.document.items[0]?.total).toBe(340);
      expect(adjusted.document.totals.subtotal).toBe(360);
      expect(adjusted.document.totals.discountTotal).toBe(20);
      expect(adjusted.document.totals.total).toBe(340);
    }
  });

  it('bloquear updateItem para item inexistente', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = updateItem(doc, 'missing', { quantity: 2 });
    expect(result.ok).toBe(false);
  });

  it('bloquear mutação de item fora de QUOTE_DRAFT', () => {
    const base = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(base, repContext);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;

    const addResult = addItem(confirmed.document, { id: 'i1', sku: 'SKU-1', description: 'Item 1', quantity: 1, unitPrice: 100 });
    const removeResult = removeItem(confirmed.document, 'i1');
    const updateResult = updateItem(confirmed.document, 'i1', { quantity: 2 });

    expect(addResult.ok).toBe(false);
    expect(removeResult.ok).toBe(false);
    expect(updateResult.ok).toBe(false);
  });

  it('confirmar orçamento para pedido com permissão válida', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const confirmAt = new Date('2026-01-01T01:00:00.000Z');
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1', now: createdAt });
    const result = confirmQuote(doc, repContext, confirmAt);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.status).toBe('ORDER_CONFIRMED');
      expect(result.document.confirmedAt).toEqual(confirmAt);
      expect(result.document.updatedAt).toEqual(confirmAt);
    }
  });

  it('bloquear confirmação sem permissão', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = confirmQuote(doc, {
      role: 'GESTOR_COMERCIAL',
      actorId: 'mgr-1',
      actorTenantId: 'tenant-1',
      actorManagerOf: ['rep-1'],
    });

    expect(result.ok).toBe(false);
  });

  it('cancelar com motivo válido', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const canceledAt = new Date('2026-01-01T02:00:00.000Z');
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1', now: createdAt });
    const result = cancelDocument(doc, repContext, 'CLIENTE_DESISTIU', undefined, canceledAt);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.status).toBe('CANCELED');
      expect(result.document.canceledAt).toEqual(canceledAt);
      expect(result.document.updatedAt).toEqual(canceledAt);
    }
  });

  it('bloquear cancelamento com OUTROS sem observação', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = cancelDocument(doc, repContext, 'OUTROS');
    expect(result.ok).toBe(false);
  });

  it('bloquear operação fora da carteira quando aplicável', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = confirmQuote(doc, {
      role: 'REPRESENTANTE',
      actorId: 'rep-2',
      actorTenantId: 'tenant-1',
    });

    expect(result.ok).toBe(false);
  });
});
