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

  it('bloqueia cancelamento de ORDER_CONFIRMED para representante', () => {
    const result = applyTransition({ current: 'ORDER_CONFIRMED', action: 'CANCEL', role: 'REPRESENTANTE' });
    expect(result.allowed).toBe(false);
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
