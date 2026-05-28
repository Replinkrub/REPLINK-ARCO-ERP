import type { AdjustmentReason, CancelReason } from './types.js';

export function validateCancelReason(reason: CancelReason, note?: string): { valid: boolean; error?: string } {
  if (reason === 'OUTROS' && !note?.trim()) {
    return { valid: false, error: 'Observação é obrigatória quando motivo de cancelamento é OUTROS' };
  }

  return { valid: true };
}

export function validateAdjustmentReason(reason: AdjustmentReason, note?: string): { valid: boolean; error?: string } {
  if (reason === 'OUTROS' && !note?.trim()) {
    return { valid: false, error: 'Observação é obrigatória quando motivo de ajuste é OUTROS' };
  }

  return { valid: true };
}
