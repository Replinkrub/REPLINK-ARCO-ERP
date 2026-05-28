import type { CommercialStatus, Role, TransitionAction } from './types.js';

const ROLES_CAN_CONFIRM_ORDER: ReadonlySet<Role> = new Set(['ADMIN', 'OWNER', 'REPRESENTANTE']);
const ROLES_CAN_CANCEL_QUOTE: ReadonlySet<Role> = new Set(['ADMIN', 'OWNER', 'REPRESENTANTE']);
const ROLES_CAN_CANCEL_ORDER_CONFIRMED: ReadonlySet<Role> = new Set(['ADMIN', 'OWNER']);
const ROLES_CAN_INVOICE: ReadonlySet<Role> = new Set(['ADMIN', 'OWNER']);
const ROLES_CAN_ADMIN_ADJUST: ReadonlySet<Role> = new Set(['ADMIN', 'OWNER']);

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
    if (!ROLES_CAN_CONFIRM_ORDER.has(role)) {
      return deny(current, 'Role sem permissão para confirmar pedido');
    }
    if (current !== 'QUOTE_DRAFT') {
      return deny(current, 'CONFIRM_ORDER só é permitido em QUOTE_DRAFT');
    }
    return allow('ORDER_CONFIRMED');
  }

  if (action === 'INVOICE') {
    if (!ROLES_CAN_INVOICE.has(role)) {
      return deny(current, 'Apenas ADMIN/OWNER podem faturar');
    }
    if (current !== 'ORDER_CONFIRMED') {
      return deny(current, 'INVOICE só é permitido em ORDER_CONFIRMED');
    }
    return allow('INVOICED');
  }

  if (action === 'CANCEL') {
    if (current === 'QUOTE_DRAFT' && !ROLES_CAN_CANCEL_QUOTE.has(role)) {
      return deny(current, 'Role sem permissão para cancelar QUOTE_DRAFT');
    }

    if (current === 'INVOICED' || current === 'CANCELED') {
      return deny(current, 'Não é permitido cancelar estado final');
    }

    if (current === 'ORDER_CONFIRMED' && !ROLES_CAN_CANCEL_ORDER_CONFIRMED.has(role)) {
      return deny(current, 'Apenas ADMIN/OWNER podem cancelar ORDER_CONFIRMED');
    }

    return allow('CANCELED');
  }

  if (action === 'ADMIN_ADJUST') {
    if (!ROLES_CAN_ADMIN_ADJUST.has(role)) {
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
