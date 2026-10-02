export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
  get status() {
    return STATUS_BY_CODE[this.code];
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found.`);
export const forbidden = (msg = 'You do not have permission to do this.') => new AppError('FORBIDDEN', msg);
export const invalid = (msg: string, field?: string) =>
  new AppError('VALIDATION_ERROR', msg, field ? { [field]: [msg] } : undefined);
