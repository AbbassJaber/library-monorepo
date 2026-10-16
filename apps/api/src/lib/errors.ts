import { ApiErrorCode } from '@library/contracts';

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export const validationError = (message: string, details?: unknown) =>
  new AppError(ApiErrorCode.enum.VALIDATION_ERROR, 400, message, details);
export const unauthenticated = (message = 'Authentication required') =>
  new AppError(ApiErrorCode.enum.UNAUTHENTICATED, 401, message);
export const forbidden = (message = 'Not allowed') =>
  new AppError(ApiErrorCode.enum.FORBIDDEN, 403, message);
export const notFound = (message = 'Not found') =>
  new AppError(ApiErrorCode.enum.NOT_FOUND, 404, message);
export const conflict = (code: ApiErrorCode, message: string, details?: unknown) =>
  new AppError(code, 409, message, details);
export const internal = (message = 'Internal error', details?: unknown) =>
  new AppError(ApiErrorCode.enum.INTERNAL, 500, message, details);
export const aiUnavailable = (message = 'The AI provider is unavailable') =>
  new AppError(ApiErrorCode.enum.AI_UNAVAILABLE, 503, message);
export const unavailable = (message: string) =>
  new AppError(ApiErrorCode.enum.INTERNAL, 503, message);
export const notReady = (message: string, details: unknown) =>
  new AppError(ApiErrorCode.enum.NOT_READY, 503, message, details);
