import type { ErrorRequestHandler } from 'express';
import { ApiErrorCode, type ErrorEnvelope } from '@library/contracts';
import { ConfirmError, ToolError } from '@library/ai';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { getRequestId } from './requestId.js';

interface PrismaLikeError {
  code?: unknown;
  meta?: unknown;
}

const isPrismaKnownError = (error: unknown): error is PrismaLikeError & { code: string } =>
  typeof error === 'object' &&
  error !== null &&
  (error as { name?: unknown }).name === 'PrismaClientKnownRequestError' &&
  typeof (error as PrismaLikeError).code === 'string';

export const errorHandler =
  (logger: Logger, exposeStack: boolean): ErrorRequestHandler =>
  (error: unknown, req, res, _next) => {
    const requestId = getRequestId(res);
    let status = 500;
    let body: ErrorEnvelope['error'] = {
      code: ApiErrorCode.enum.INTERNAL,
      message: 'Internal error',
      requestId,
    };

    if (error instanceof AppError) {
      status = error.status;
      body = { code: error.code, message: error.message, requestId };
      if (error.details !== undefined) body.details = error.details;
    } else if (error instanceof ConfirmError) {
      status = error.status;
      const code = {
        INVALID_TOKEN: ApiErrorCode.enum.CONFIRM_TOKEN_INVALID,
        EXPIRED: ApiErrorCode.enum.CONFIRM_TOKEN_INVALID,
        WRONG_ACTOR: ApiErrorCode.enum.FORBIDDEN,
        ALREADY_DECIDED: ApiErrorCode.enum.ACTION_ALREADY_DECIDED,
      } as const;
      body = { code: code[error.code], message: error.message, requestId };
    } else if (error instanceof ToolError && error.status < 500) {
      status = error.status;
      const code = {
        FORBIDDEN: ApiErrorCode.enum.FORBIDDEN,
        INVALID_INPUT: ApiErrorCode.enum.VALIDATION_ERROR,
        UNKNOWN_TOOL: ApiErrorCode.enum.NOT_FOUND,
      } as const;
      body = { code: code[error.code as keyof typeof code], message: error.message, requestId };
      if (error.details !== undefined) body.details = { issues: error.details };
    } else if (error instanceof ZodError) {
      status = 400;
      body = {
        code: ApiErrorCode.enum.VALIDATION_ERROR,
        message: 'Invalid request',
        details: {
          issues: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
        },
        requestId,
      };
    } else if (isPrismaKnownError(error)) {
      if (error.code === 'P2002') {
        status = 409;
        body = {
          code: ApiErrorCode.enum.CONFLICT,
          message: 'A record with the same unique value exists',
          requestId,
        };
      } else if (error.code === 'P2025') {
        status = 404;
        body = { code: ApiErrorCode.enum.NOT_FOUND, message: 'Record not found', requestId };
      }
    } else if (
      typeof error === 'object' &&
      error !== null &&
      (error as { type?: unknown }).type === 'entity.parse.failed'
    ) {
      status = 400;
      body = {
        code: ApiErrorCode.enum.VALIDATION_ERROR,
        message: 'Malformed JSON body',
        requestId,
      };
    }

    if (status >= 500) {
      logger.error('unhandled error', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (exposeStack && error instanceof Error) body.details = { stack: error.stack };
    }

    res.status(status).json({ error: body });
  };
