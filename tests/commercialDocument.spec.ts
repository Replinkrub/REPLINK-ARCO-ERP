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

  it('confirmar orçamento para pedido com permissão válida', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = confirmQuote(doc, repContext);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.status).toBe('ORDER_CONFIRMED');
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
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = cancelDocument(doc, repContext, 'CLIENTE_DESISTIU');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.status).toBe('CANCELED');
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
