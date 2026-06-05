import { describe, expect, it } from 'vitest';
import {
  DOMAIN_ERROR_CODES,
  addItem,
  adjustConfirmedOrder,
  cancelDocument,
  confirmQuote,
  convertQuoteToOrder,
  createQuote,
  generateCommercialDocumentNumber,
  invoiceOrder,
  registerOutputEvent,
  removeItem,
  updateItem,
  type AccessContext,
} from '../src/index.js';

const repContext: AccessContext = { role: 'REPRESENTANTE', actorId: 'rep-1', actorTenantId: 'tenant-1' };
const adminContext: AccessContext = { role: 'ADMIN', actorId: 'admin-1', actorTenantId: 'tenant-1' };
const ownerContext: AccessContext = { role: 'OWNER', actorId: 'owner-1', actorTenantId: 'tenant-1' };

const expectFailureCode = (result: ReturnType<typeof confirmQuote> | ReturnType<typeof addItem>, code: string) => {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
};

describe('commercialDocument core', () => {
  it('criar orçamento válido', () => {
    const doc = createQuote({ id: 'doc-0', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    expect(doc.status).toBe('QUOTE_DRAFT');
    expect(doc.totals.total).toBe(0);
    expect(doc.representedCompanyId).toBeUndefined();
  });

  it('criar orçamento preserva representada opcional', () => {
    const doc = createQuote({
      id: 'doc-represented',
      tenantId: 'tenant-1',
      representedCompanyId: 'represented-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
    });

    expect(doc.representedCompanyId).toBe('represented-1');
  });

  it('retorno de sucesso traz payload mínimo e events array', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = addItem(doc, { id: 'i1', sku: 'SKU-1', description: 'Item 1', quantity: 2, unitPrice: 100, discount: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.totals.total).toBe(190);
      expect(result.events).toEqual([]);
    }
  });

  it('erro canônico estável com code/message', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const first = addItem(doc, { id: 'i1', sku: 'SKU-1', description: 'Item 1', quantity: 1, unitPrice: 100 });
    if (!first.ok) return;
    const duplicated = addItem(first.document, { id: 'i1', sku: 'SKU-2', description: 'Item 2', quantity: 1, unitPrice: 50 });
    expectFailureCode(duplicated, DOMAIN_ERROR_CODES.DUPLICATE_ITEM);
    if (!duplicated.ok) expect(duplicated.error.message).toBe('Item já existe no documento');
  });

  it('itens inválidos não entram e total nunca negativo', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const invalidQty = addItem(doc, { id: 'i1', sku: 'SKU-1', description: 'Item 1', quantity: 0, unitPrice: 100 });
    expectFailureCode(invalidQty, DOMAIN_ERROR_CODES.INVALID_ITEM_QUANTITY);
    const invalidDiscount = addItem(doc, { id: 'i2', sku: 'SKU-2', description: 'Item 2', quantity: 1, unitPrice: 100, discount: 101 });
    expectFailureCode(invalidDiscount, DOMAIN_ERROR_CODES.INVALID_DISCOUNT);
    expect(doc.items).toHaveLength(0);
    expect(doc.totals.total).toBe(0);
  });

  it('remove e update mantêm contrato canônico', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const withA = addItem(doc, { id: 'a', sku: 'A', description: 'A', quantity: 1, unitPrice: 100 });
    if (!withA.ok) return;
    const updated = updateItem(withA.document, 'a', { quantity: 2, discount: 10 });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.document.totals.total).toBe(190);
    const removed = removeItem(updated.document, 'a');
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(removed.document.totals.total).toBe(0);
  });

  it('remove item inexistente retorna ITEM_NOT_FOUND', () => {
    const doc = createQuote({ id: 'doc-rm', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = removeItem(doc, 'missing');
    expectFailureCode(result, DOMAIN_ERROR_CODES.ITEM_NOT_FOUND);
  });

  it('update item inexistente retorna ITEM_NOT_FOUND', () => {
    const doc = createQuote({ id: 'doc-up', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = updateItem(doc, 'missing', { quantity: 2 });
    expectFailureCode(result, DOMAIN_ERROR_CODES.ITEM_NOT_FOUND);
  });

  it('confirmar já confirmado usa negação estável', () => {
    const base = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(base, repContext);
    if (!confirmed.ok) return;
    const again = confirmQuote(confirmed.document, repContext);
    expectFailureCode(again, DOMAIN_ERROR_CODES.DOCUMENT_ALREADY_CONFIRMED);
    if (!again.ok) {
      expect(again.events.at(-1)?.type).toBe('OPERATION_DENIED');
      expect(again.events.at(-1)?.payload).toMatchObject({ operation: 'CONFIRM_ORDER', documentId: 'doc-1', tenantId: 'tenant-1' });
    }
  });

  it('cancelar já cancelado usa negação estável', () => {
    const base = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const canceled = cancelDocument(base, repContext, 'CLIENTE_DESISTIU');
    if (!canceled.ok) return;
    const again = cancelDocument(canceled.document, repContext, 'CLIENTE_DESISTIU');
    expectFailureCode(again, DOMAIN_ERROR_CODES.DOCUMENT_ALREADY_CANCELLED);
  });

  it('faturar já faturado usa negação estável', () => {
    const base = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(base, repContext);
    if (!confirmed.ok) return;
    const invoiced = invoiceOrder(confirmed.document, adminContext);
    if (!invoiced.ok) return;
    const again = invoiceOrder(invoiced.document, adminContext);
    expectFailureCode(again, DOMAIN_ERROR_CODES.DOCUMENT_ALREADY_INVOICED);
  });

  it('faturar fora de ORDER_CONFIRMED retorna INVOICE_NOT_ALLOWED', () => {
    const draft = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = invoiceOrder(draft, adminContext);
    expectFailureCode(result, DOMAIN_ERROR_CODES.INVOICE_NOT_ALLOWED);
  });

  it('cancelamento OUTROS sem observação retorna INVALID_CANCEL_REASON', () => {
    const draft = createQuote({ id: 'doc-c1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = cancelDocument(draft, repContext, 'OUTROS');
    expectFailureCode(result, DOMAIN_ERROR_CODES.INVALID_CANCEL_REASON);
  });

  it('ajuste OUTROS sem observação retorna INVALID_ADJUSTMENT_REASON', () => {
    const draft = createQuote({ id: 'doc-c2', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(draft, repContext);
    if (!confirmed.ok) return;
    const result = adjustConfirmedOrder(confirmed.document, adminContext, 'OUTROS');
    expectFailureCode(result, DOMAIN_ERROR_CODES.INVALID_ADJUSTMENT_REASON);
  });

  it('mutação de item em CANCELED gera OPERATION_DENIED + payload mínimo', () => {
    const draft = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const canceled = cancelDocument(draft, repContext, 'CLIENTE_DESISTIU');
    if (!canceled.ok) return;
    const result = addItem(canceled.document, { id: 'i1', sku: 'SKU-1', description: 'Item', quantity: 1, unitPrice: 1 });
    expectFailureCode(result, DOMAIN_ERROR_CODES.OPERATION_DENIED);
    if (!result.ok) {
      expect(result.events.at(-1)?.type).toBe('OPERATION_DENIED');
      expect(result.events.at(-1)?.payload).toMatchObject({ operation: 'ADD_ITEM', tenantId: 'tenant-1', currentStatus: 'CANCELED' });
    }
  });

  it('mutação de item em INVOICED gera OPERATION_DENIED', () => {
    const draft = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(draft, repContext);
    if (!confirmed.ok) return;
    const invoiced = invoiceOrder(confirmed.document, adminContext);
    if (!invoiced.ok) return;
    const result = updateItem(invoiced.document, 'x', { quantity: 2 });
    expectFailureCode(result, DOMAIN_ERROR_CODES.OPERATION_DENIED);
  });

  it('mutação de item em ORDER_CONFIRMED gera OPERATION_DENIED com payload mínimo', () => {
    const draft = createQuote({ id: 'doc-oc', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(draft, repContext);
    if (!confirmed.ok) return;

    const result = addItem(confirmed.document, {
      id: 'i-order-confirmed',
      sku: 'SKU-OC',
      description: 'Item OC',
      quantity: 1,
      unitPrice: 10,
    });

    expectFailureCode(result, DOMAIN_ERROR_CODES.INVALID_DOCUMENT_STATE);
    if (!result.ok) {
      expect(result.events.at(-1)?.type).toBe('OPERATION_DENIED');
      expect(result.events.at(-1)?.payload).toMatchObject({
        operation: 'ADD_ITEM',
        documentId: 'doc-oc',
        tenantId: 'tenant-1',
        currentStatus: 'ORDER_CONFIRMED',
        code: DOMAIN_ERROR_CODES.INVALID_DOCUMENT_STATE,
      });
    }
  });

  it('payload mínimo em evento de sucesso', () => {
    const base = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(base, repContext);
    if (!confirmed.ok) return;
    const invoiced = invoiceOrder(confirmed.document, ownerContext, 'NF-123');
    expect(invoiced.ok).toBe(true);
    if (invoiced.ok) {
      expect(invoiced.events.at(-1)?.type).toBe('ORDER_INVOICED');
      expect(invoiced.events.at(-1)?.payload).toMatchObject({ actorId: 'owner-1', role: 'OWNER', manualReference: 'NF-123' });
    }
  });

  it('faturamento permitido para ADMIN/OWNER', () => {
    const base = createQuote({ id: 'doc-ok1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(base, repContext);
    if (!confirmed.ok) return;
    const byAdmin = invoiceOrder(confirmed.document, adminContext);
    expect(byAdmin.ok).toBe(true);

    const base2 = createQuote({ id: 'doc-ok2', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed2 = confirmQuote(base2, repContext);
    if (!confirmed2.ok) return;
    const byOwner = invoiceOrder(confirmed2.document, ownerContext);
    expect(byOwner.ok).toBe(true);
  });

  it('faturamento negado para representante', () => {
    const base = createQuote({ id: 'doc-no1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(base, repContext);
    if (!confirmed.ok) return;
    const result = invoiceOrder(confirmed.document, repContext);
    expect(result.ok).toBe(false);
  });

  it('ajuste permitido para ADMIN/OWNER e preserva ORDER_CONFIRMED', () => {
    const base = createQuote({ id: 'doc-aj', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(base, repContext);
    if (!confirmed.ok) return;
    const byAdmin = adjustConfirmedOrder(
      confirmed.document,
      adminContext,
      'AJUSTE_PRECO',
      'ok',
      {
        items: [
          {
            id: 'rev-1',
            sku: 'SKU-REV-1',
            description: 'Item revisado',
            quantity: 2,
            unitPrice: 50,
            discount: 10,
            total: 90,
          },
        ],
        totals: { itemsCount: 1, subtotal: 100, discountTotal: 10, total: 90 },
      }
    );
    expect(byAdmin.ok).toBe(true);
    if (!byAdmin.ok) return;
    expect(byAdmin.document.status).toBe('ORDER_CONFIRMED');
    expect(byAdmin.document.totals.total).toBe(90);
    expect(byAdmin.document.orderRevisions).toHaveLength(1);
    expect(byAdmin.document.orderRevisions[0]).toMatchObject({
      revisionNumber: 1,
      reason: 'AJUSTE_PRECO',
      note: 'ok',
      createdBy: 'admin-1',
      beforePayload: { status: 'ORDER_CONFIRMED' },
      afterPayload: { status: 'ORDER_CONFIRMED', totals: { total: 90 }, items: [{ id: 'rev-1' }] },
    });
    expect(byAdmin.document.orderRevisions[0]?.beforePayload.totals.total).toBe(0);
    expect(byAdmin.document.orderRevisions[0]?.afterPayload.totals.total).toBe(90);
    expect(byAdmin.document.lifecycleEvents.at(-1)).toMatchObject({
      type: 'ORDER_ADJUSTED',
      reason: 'AJUSTE_PRECO',
      revisionNumber: 1,
    });
    expect(byAdmin.events.at(-1)?.payload).toMatchObject({
      reason: 'AJUSTE_PRECO',
      revisionNumber: 1,
      actorId: 'admin-1',
    });

    const byOwner = adjustConfirmedOrder(
      byAdmin.document,
      ownerContext,
      'AJUSTE_ITEM',
      'ok2',
      {
        items: [
          {
            id: 'rev-1',
            sku: 'SKU-REV-1',
            description: 'Item revisado owner',
            quantity: 3,
            unitPrice: 50,
            discount: 0,
            total: 150,
          },
        ],
        totals: { itemsCount: 1, subtotal: 150, discountTotal: 0, total: 150 },
      }
    );
    expect(byOwner.ok).toBe(true);
    if (!byOwner.ok) return;
    expect(byOwner.document.status).toBe('ORDER_CONFIRMED');
    expect(byOwner.document.totals.total).toBe(150);
    expect(byOwner.document.orderRevisions).toHaveLength(2);
    expect(byOwner.document.orderRevisions[1]).toMatchObject({
      revisionNumber: 2,
      reason: 'AJUSTE_ITEM',
      note: 'ok2',
      createdBy: 'owner-1',
      beforePayload: { status: 'ORDER_CONFIRMED', totals: { total: 90 } },
      afterPayload: { status: 'ORDER_CONFIRMED', totals: { total: 150 } },
    });
  });

  it('ajuste negado para representante', () => {
    const base = createQuote({ id: 'doc-aj2', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(base, repContext);
    if (!confirmed.ok) return;
    const result = adjustConfirmedOrder(confirmed.document, repContext, 'AJUSTE_PRECO', 'tentativa');
    expect(result.ok).toBe(false);
  });

  it('ajuste sem alteração efetiva é negado', () => {
    const base = createQuote({ id: 'doc-aj3', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const confirmed = confirmQuote(base, repContext);
    if (!confirmed.ok) return;

    const result = adjustConfirmedOrder(confirmed.document, adminContext, 'AJUSTE_PRECO', 'sem mudança');
    expectFailureCode(result, DOMAIN_ERROR_CODES.INVALID_ADJUSTMENT_REASON);
    if (!result.ok) {
      expect(result.error.message).toBe('Ajuste administrativo sem alteração efetiva');
      expect(result.events.at(-1)?.type).toBe('OPERATION_DENIED');
    }
  });

  it('ajuste em estado diferente de ORDER_CONFIRMED é negado', () => {
    const draft = createQuote({ id: 'doc-aj4', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const result = adjustConfirmedOrder(draft, adminContext, 'AJUSTE_PRECO', 'tentativa em draft');
    expectFailureCode(result, DOMAIN_ERROR_CODES.INVALID_DOCUMENT_STATE);
    if (!result.ok) {
      expect(result.events.at(-1)?.type).toBe('OPERATION_DENIED');
      expect(result.events.at(-1)?.payload).toMatchObject({
        operation: 'ADMIN_ADJUST',
        currentStatus: 'QUOTE_DRAFT',
      });
    }
  });

  it('payload mínimo em evento de negação por ownership/tenant', () => {
    const doc = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const wrongTenant: AccessContext = { role: 'ADMIN', actorId: 'admin-2', actorTenantId: 'tenant-2' };
    const denied = confirmQuote(doc, wrongTenant);
    expectFailureCode(denied, DOMAIN_ERROR_CODES.TENANT_MISMATCH);
    if (!denied.ok) {
      expect(denied.events.at(-1)?.type).toBe('OPERATION_DENIED');
      expect(denied.events.at(-1)?.payload).toMatchObject({ operation: 'CONFIRM_ORDER', tenantId: 'tenant-1', actorId: 'admin-2', role: 'ADMIN' });
    }
  });

  it('regressão: output event não altera status', () => {
    const base = createQuote({ id: 'doc-1', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const lifecycleBefore = base.lifecycleEvents.length;
    const outputBefore = base.outputEvents.length;
    const outputOnDraft = registerOutputEvent(base, repContext, 'SEND_WHATSAPP', 'whatsapp enviado');
    expect(outputOnDraft.ok).toBe(true);
    if (outputOnDraft.ok) {
      expect(outputOnDraft.document.status).toBe('QUOTE_DRAFT');
      expect(outputOnDraft.document.lifecycleEvents).toHaveLength(lifecycleBefore);
      expect(outputOnDraft.document.outputEvents).toHaveLength(outputBefore + 1);
      expect(outputOnDraft.events.at(-1)?.type).toBe('OUTPUT_EVENT_REGISTERED');
    }
  });

  it('output events aceita todos canais F-11 sem mutar status/lifecycle', () => {
    const base = createQuote({ id: 'doc-out-all', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const channels = ['SEND_WHATSAPP', 'SEND_EMAIL', 'GENERATE_PDF', 'PRINT', 'COPY_LINK', 'SHARE'] as const;

    const result = channels.reduce((acc, channel) => {
      if (!acc.ok) return acc;
      return registerOutputEvent(acc.document, repContext, channel, `evento ${channel}`);
    }, { ok: true, document: base } as { ok: true; document: typeof base } | ReturnType<typeof registerOutputEvent>);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.status).toBe('QUOTE_DRAFT');
    expect(result.document.lifecycleEvents).toHaveLength(0);
    expect(result.document.outputEvents).toHaveLength(channels.length);
    expect(result.document.outputEvents.map((item) => item.channel)).toEqual(channels);
  });

  it('output event negado por acesso não muta lifecycle/output', () => {
    const base = createQuote({ id: 'doc-out-denied', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const wrongTenant: AccessContext = { role: 'ADMIN', actorId: 'admin-2', actorTenantId: 'tenant-2' };

    const result = registerOutputEvent(base, wrongTenant, 'SEND_EMAIL', 'tentativa');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DOMAIN_ERROR_CODES.TENANT_MISMATCH);
      expect(base.lifecycleEvents).toHaveLength(0);
      expect(base.outputEvents).toHaveLength(0);
    }
  });

  it('determinismo: mesmo tipo + sequência => mesmo número', () => {
    expect(generateCommercialDocumentNumber({ type: 'quote', sequence: 7 })).toBe('ORC-000007');
    expect(generateCommercialDocumentNumber({ type: 'quote', sequence: 7 })).toBe('ORC-000007');
    expect(generateCommercialDocumentNumber({ type: 'order', sequence: 7 })).toBe('PED-000007');
  });

  it('conversão quote→order gera PED novo sem reaproveitar ORC', () => {
    const quote = createQuote({
      id: 'doc-conv',
      tenantId: 'tenant-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 31,
    });
    expect(quote.number).toBe('ORC-000031');

    const converted = convertQuoteToOrder(quote, 77);
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    expect(converted.document.documentType).toBe('order');
    expect(converted.document.id).not.toBe(quote.id);
    expect(converted.document.number).toBe('PED-000077');
    expect(converted.document.number).not.toBe(quote.number);
    expect(converted.document.source_quote_id).toBe('doc-conv');
    expect(converted.document.source_quote_number).toBe('ORC-000031');
    expect(converted.document.sourceQuoteSnapshot).toMatchObject({
      source_quote_id: 'doc-conv',
      source_quote_number: 'ORC-000031',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      totals: { subtotal: 0, discountTotal: 0, total: 0 },
      items: [],
    });
  });

  it('conversão quote→order herda representada e preserva no snapshot', () => {
    const quote = createQuote({
      id: 'doc-conv-represented',
      tenantId: 'tenant-1',
      representedCompanyId: 'represented-1',
      ownerId: 'owner-1',
      representativeId: 'rep-1',
      numberSequence: 32,
    });

    const converted = convertQuoteToOrder(quote, 78);
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    expect(converted.document.representedCompanyId).toBe('represented-1');
    expect(converted.document.sourceQuoteSnapshot?.represented_company_id).toBe('represented-1');
  });

  it('quote cancelado não converte para order', () => {
    const quote = createQuote({ id: 'doc-canceled', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const canceled = cancelDocument(quote, repContext, 'CLIENTE_DESISTIU');
    if (!canceled.ok) return;

    const converted = convertQuoteToOrder(canceled.document, 90);
    expect(converted.ok).toBe(false);
    if (!converted.ok) {
      expect(converted.error.code).toBe(DOMAIN_ERROR_CODES.INVALID_DOCUMENT_STATE);
    }
  });

  it('snapshot do quote é imutável após conversão', () => {
    const base = createQuote({ id: 'doc-immut', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const withItem = addItem(base, {
      id: 'i1',
      sku: 'SKU-1',
      description: 'Item base',
      quantity: 2,
      unitPrice: 100,
      discount: 10,
    });
    if (!withItem.ok) return;

    const converted = convertQuoteToOrder(withItem.document, 88);
    if (!converted.ok) return;

    const originalSnapshot = converted.document.sourceQuoteSnapshot;
    expect(originalSnapshot?.items[0]).toMatchObject({
      id: 'i1',
      description: 'Item base',
      quantity: 2,
      unitPrice: 100,
      discount: 10,
      total: 190,
    });

    const mutatedQuote = updateItem(withItem.document, 'i1', { quantity: 10, discount: 0 });
    if (!mutatedQuote.ok) return;

    expect(mutatedQuote.document.items[0]?.total).toBe(1000);
    expect(converted.document.sourceQuoteSnapshot).toEqual(originalSnapshot);
    expect(converted.document.sourceQuoteSnapshot?.items[0]?.total).toBe(190);
  });

  it('dupla conversão bloqueia com DOCUMENT_ALREADY_CONFIRMED sem duplicar pedido/evento', () => {
    const quote = createQuote({ id: 'doc-double', tenantId: 'tenant-1', ownerId: 'owner-1', representativeId: 'rep-1' });
    const first = convertQuoteToOrder(quote, 90);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = convertQuoteToOrder(first.document, 91);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe(DOMAIN_ERROR_CODES.DOCUMENT_ALREADY_CONFIRMED);
      expect(second.events).toHaveLength(1);
      expect(second.events[0]?.type).toBe('OPERATION_DENIED');
      expect(second.events[0]?.payload).toMatchObject({
        operation: 'CONFIRM_ORDER',
        documentId: 'doc-double:order',
        tenantId: 'tenant-1',
        code: DOMAIN_ERROR_CODES.DOCUMENT_ALREADY_CONFIRMED,
      });
    }

    expect(first.document.number).toBe('PED-000090');
    expect(first.document.source_quote_number).toBe('ORC-000001');
  });
});
