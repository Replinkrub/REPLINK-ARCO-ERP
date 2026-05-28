import { describe, expect, it } from 'vitest';
import {
  applyTransition,
  canAccessRecord,
  canChangeOwnership,
  canDeleteCommercialRecord,
  validateAdjustmentReason,
  validateCancelReason,
} from '../src/index.js';

describe('state machine', () => {
  it('confirma pedido a partir de QUOTE_DRAFT', () => {
    const result = applyTransition({ current: 'QUOTE_DRAFT', action: 'CONFIRM_ORDER', role: 'REPRESENTANTE' });
    expect(result.allowed).toBe(true);
    expect(result.next).toBe('ORDER_CONFIRMED');
  });

  it('nega confirmação para role sem permissão (deny-by-default)', () => {
    const result = applyTransition({ current: 'QUOTE_DRAFT', action: 'CONFIRM_ORDER', role: 'GESTOR_COMERCIAL' });
    expect(result.allowed).toBe(false);
    expect(result.next).toBe('QUOTE_DRAFT');
  });

  it('bloqueia cancelamento de ORDER_CONFIRMED para representante', () => {
    const result = applyTransition({ current: 'ORDER_CONFIRMED', action: 'CANCEL', role: 'REPRESENTANTE' });
    expect(result.allowed).toBe(false);
  });

  it('permite cancelamento de ORDER_CONFIRMED para ADMIN e OWNER', () => {
    const adminResult = applyTransition({ current: 'ORDER_CONFIRMED', action: 'CANCEL', role: 'ADMIN' });
    const ownerResult = applyTransition({ current: 'ORDER_CONFIRMED', action: 'CANCEL', role: 'OWNER' });

    expect(adminResult.allowed).toBe(true);
    expect(adminResult.next).toBe('CANCELED');
    expect(ownerResult.allowed).toBe(true);
    expect(ownerResult.next).toBe('CANCELED');
  });

  it('nega faturamento para representante', () => {
    const result = applyTransition({ current: 'ORDER_CONFIRMED', action: 'INVOICE', role: 'REPRESENTANTE' });
    expect(result.allowed).toBe(false);
    expect(result.next).toBe('ORDER_CONFIRMED');
  });

  it('permite faturamento para ADMIN e OWNER', () => {
    const adminResult = applyTransition({ current: 'ORDER_CONFIRMED', action: 'INVOICE', role: 'ADMIN' });
    const ownerResult = applyTransition({ current: 'ORDER_CONFIRMED', action: 'INVOICE', role: 'OWNER' });

    expect(adminResult.allowed).toBe(true);
    expect(adminResult.next).toBe('INVOICED');
    expect(ownerResult.allowed).toBe(true);
    expect(ownerResult.next).toBe('INVOICED');
  });

  it('nega cancelamento de QUOTE_DRAFT para role sem permissão', () => {
    const result = applyTransition({ current: 'QUOTE_DRAFT', action: 'CANCEL', role: 'SUPORTE_OPERACAO' });
    expect(result.allowed).toBe(false);
    expect(result.next).toBe('QUOTE_DRAFT');
  });

  it('bloqueia transições inválidas por estado', () => {
    const confirmFromInvoiced = applyTransition({ current: 'INVOICED', action: 'CONFIRM_ORDER', role: 'ADMIN' });
    const invoiceFromQuote = applyTransition({ current: 'QUOTE_DRAFT', action: 'INVOICE', role: 'ADMIN' });
    const adjustFromQuote = applyTransition({ current: 'QUOTE_DRAFT', action: 'ADMIN_ADJUST', role: 'ADMIN' });
    const cancelFromInvoiced = applyTransition({ current: 'INVOICED', action: 'CANCEL', role: 'ADMIN' });
    const cancelFromCanceled = applyTransition({ current: 'CANCELED', action: 'CANCEL', role: 'ADMIN' });

    expect(confirmFromInvoiced.allowed).toBe(false);
    expect(confirmFromInvoiced.next).toBe('INVOICED');
    expect(invoiceFromQuote.allowed).toBe(false);
    expect(invoiceFromQuote.next).toBe('QUOTE_DRAFT');
    expect(adjustFromQuote.allowed).toBe(false);
    expect(adjustFromQuote.next).toBe('QUOTE_DRAFT');
    expect(cancelFromInvoiced.allowed).toBe(false);
    expect(cancelFromInvoiced.next).toBe('INVOICED');
    expect(cancelFromCanceled.allowed).toBe(false);
    expect(cancelFromCanceled.next).toBe('CANCELED');
  });

  it('nega ADMIN_ADJUST para REPRESENTANTE em ORDER_CONFIRMED', () => {
    const result = applyTransition({ current: 'ORDER_CONFIRMED', action: 'ADMIN_ADJUST', role: 'REPRESENTANTE' });
    expect(result.allowed).toBe(false);
    expect(result.next).toBe('ORDER_CONFIRMED');
  });

  it('permite ADMIN_ADJUST para ADMIN/OWNER mantendo ORDER_CONFIRMED', () => {
    const adminResult = applyTransition({ current: 'ORDER_CONFIRMED', action: 'ADMIN_ADJUST', role: 'ADMIN' });
    const ownerResult = applyTransition({ current: 'ORDER_CONFIRMED', action: 'ADMIN_ADJUST', role: 'OWNER' });

    expect(adminResult.allowed).toBe(true);
    expect(adminResult.next).toBe('ORDER_CONFIRMED');
    expect(ownerResult.allowed).toBe(true);
    expect(ownerResult.next).toBe('ORDER_CONFIRMED');
  });
});

describe('ownership', () => {
  it('representante acessa apenas própria carteira', () => {
    const own = canAccessRecord(
      { role: 'REPRESENTANTE', actorId: 'r1', actorTenantId: 't1' },
      { representativeId: 'r1', tenantId: 't1' }
    );
    const other = canAccessRecord(
      { role: 'REPRESENTANTE', actorId: 'r1', actorTenantId: 't1' },
      { representativeId: 'r2', tenantId: 't1' }
    );

    expect(own).toBe(true);
    expect(other).toBe(false);
  });

  it('somente ADMIN/OWNER pode mudar ownership e excluir registro comercial', () => {
    expect(canChangeOwnership('ADMIN')).toBe(true);
    expect(canChangeOwnership('REPRESENTANTE')).toBe(false);
    expect(canDeleteCommercialRecord('OWNER')).toBe(true);
    expect(canDeleteCommercialRecord('REPRESENTANTE')).toBe(false);
  });
});

describe('reason validation', () => {
  it('exige observação em OUTROS', () => {
    expect(validateCancelReason('OUTROS').valid).toBe(false);
    expect(validateAdjustmentReason('OUTROS').valid).toBe(false);
    expect(validateCancelReason('OUTROS', 'detalhe').valid).toBe(true);
    expect(validateAdjustmentReason('OUTROS', 'detalhe').valid).toBe(true);
  });
});
