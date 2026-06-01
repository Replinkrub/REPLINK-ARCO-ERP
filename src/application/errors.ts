export const APPLICATION_ERROR_CODES = {
  REQUIRED_CUSTOMER_ID: 'REQUIRED_CUSTOMER_ID',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  DOCUMENT_NOT_QUOTE: 'DOCUMENT_NOT_QUOTE',
  DOMAIN_OPERATION_FAILED: 'DOMAIN_OPERATION_FAILED',
} as const;

export type ApplicationErrorCode = (typeof APPLICATION_ERROR_CODES)[keyof typeof APPLICATION_ERROR_CODES];

export interface ApplicationError {
  code: ApplicationErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
