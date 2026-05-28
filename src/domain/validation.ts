import { DOMAIN_ERROR_CODES, type DomainError, type DomainErrorCode } from './errors.js';
import type { CommercialStatus, Role, TransitionAction } from './types.js';

export interface DomainEvent {
  type: 'ORDER_ADJUSTED' | 'ORDER_INVOICED' | 'OUTPUT_EVENT_REGISTERED' | 'OPERATION_DENIED';
  at: Date;
  payload: Record<string, unknown>;
}

export interface DomainSuccessResult<T> {
  ok: true;
  document: T;
  events: DomainEvent[];
}

export interface DomainFailureResult {
  ok: false;
  error: DomainError;
  events: DomainEvent[];
}

export type DomainResult<T> = DomainSuccessResult<T> | DomainFailureResult;

export function success<T>(document: T, events: DomainEvent[] = []): DomainSuccessResult<T> {
  return { ok: true, document, events };
}

export function domainError(code: DomainErrorCode, message: string, details?: Record<string, unknown>): DomainError {
  return { code, message, details };
}

export function deniedEvent(input: {
  operation: TransitionAction | 'ADD_ITEM' | 'UPDATE_ITEM' | 'REMOVE_ITEM';
  at: Date;
  reason: string;
  code: DomainErrorCode;
  tenantId: string;
  documentId?: string;
  actorId?: string;
  role?: Role;
  currentStatus?: CommercialStatus;
}): DomainEvent {
  return {
    type: 'OPERATION_DENIED',
    at: input.at,
    payload: {
      operation: input.operation,
      documentId: input.documentId,
      tenantId: input.tenantId,
      actorId: input.actorId,
      role: input.role,
      currentStatus: input.currentStatus,
      reason: input.reason,
      code: input.code,
    },
  };
}

export function failure(input: {
  code: DomainErrorCode;
  message: string;
  at: Date;
  operation: TransitionAction | 'ADD_ITEM' | 'UPDATE_ITEM' | 'REMOVE_ITEM';
  tenantId: string;
  documentId?: string;
  actorId?: string;
  role?: Role;
  currentStatus?: CommercialStatus;
  details?: Record<string, unknown>;
  withDeniedEvent?: boolean;
}): DomainFailureResult {
  const events = input.withDeniedEvent
    ? [
        deniedEvent({
          operation: input.operation,
          at: input.at,
          reason: input.message,
          code: input.code,
          tenantId: input.tenantId,
          documentId: input.documentId,
          actorId: input.actorId,
          role: input.role,
          currentStatus: input.currentStatus,
        }),
      ]
    : [];

  return {
    ok: false,
    error: domainError(input.code, input.message, input.details),
    events,
  };
}

export { DOMAIN_ERROR_CODES };
