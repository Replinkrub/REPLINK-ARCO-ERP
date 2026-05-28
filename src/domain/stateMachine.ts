import type { CommercialStatus, Role, TransitionAction } from './types.js';

export interface TransitionRequest {
  current: CommercialStatus;
  action: TransitionAction;
  role: Role;
}

export interface TransitionResult {
  allowed: boolean;
  next: CommercialStatus;
  reason?: string;
}

export function applyTransition(input: TransitionRequest): TransitionResult {
  const { current, action, role } = input;

  if (action === 'CONFIRM_ORDER') {
    if (current !== 'QUOTE_DRAFT') {
      return deny(current, 'CONFIRM_ORDER só é permitido em QUOTE_DRAFT');
    }
    return allow('ORDER_CONFIRMED');
  }

  if (action === 'INVOICE') {
    if (role !== 'ADMIN' && role !== 'OWNER') {
      return deny(current, 'Apenas ADMIN/OWNER podem faturar');
    }
    if (current !== 'ORDER_CONFIRMED') {
      return deny(current, 'INVOICE só é permitido em ORDER_CONFIRMED');
    }
    return allow('INVOICED');
  }

  if (action === 'CANCEL') {
    if (current === 'INVOICED' || current === 'CANCELED') {
      return deny(current, 'Não é permitido cancelar estado final');
    }

    if (current === 'ORDER_CONFIRMED' && role !== 'ADMIN' && role !== 'OWNER') {
      return deny(current, 'Apenas ADMIN/OWNER podem cancelar ORDER_CONFIRMED');
    }

    return allow('CANCELED');
  }

  if (action === 'ADMIN_ADJUST') {
    if (role !== 'ADMIN' && role !== 'OWNER') {
      return deny(current, 'Apenas ADMIN/OWNER podem ajustar pedido');
    }
    if (current !== 'ORDER_CONFIRMED') {
      return deny(current, 'Ajuste só é permitido em ORDER_CONFIRMED');
    }
    return allow('ORDER_CONFIRMED');
  }

  return deny(current, 'Ação não suportada');
}

function allow(next: CommercialStatus): TransitionResult {
  return { allowed: true, next };
}

function deny(current: CommercialStatus, reason: string): TransitionResult {
  return { allowed: false, next: current, reason };
}
