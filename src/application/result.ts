import type { ApplicationError, ApplicationErrorCode } from './errors.js';

export interface ApplicationSuccessResult<T> {
  ok: true;
  data: T;
}

export interface ApplicationFailureResult {
  ok: false;
  error: ApplicationError;
}

export type ApplicationResult<T> = ApplicationSuccessResult<T> | ApplicationFailureResult;

export function applicationSuccess<T>(data: T): ApplicationSuccessResult<T> {
  return { ok: true, data };
}

export function applicationFailure(
  code: ApplicationErrorCode,
  message: string,
  details?: Record<string, unknown>
): ApplicationFailureResult {
  return {
    ok: false,
    error: { code, message, details },
  };
}
