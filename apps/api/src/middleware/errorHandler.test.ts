import { ToolError } from '@library/ai';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../test/logger.js';
import { errorHandler } from './errorHandler.js';

const respond = (error: unknown) => {
  const sent: { status?: number; body?: { error: { code: string; message: string } } } = {};
  const res = {
    locals: {},
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: { error: { code: string; message: string } }) {
      sent.body = body;
      return this;
    },
  };
  errorHandler(silentLogger, false)(
    error,
    { method: 'POST', originalUrl: '/x' } as never,
    res as never,
    () => {}
  );
  return sent;
};

describe('errorHandler', () => {
  it('answers a tool error with its own status and code (the registry gate says 403 like HTTP)', () => {
    expect(
      respond(new ToolError('FORBIDDEN', 'Tool "draftBook" requires the librarian role'))
    ).toMatchObject({
      status: 403,
      body: { error: { code: 'FORBIDDEN' } },
    });
    expect(respond(new ToolError('INVALID_INPUT', 'bad'))).toMatchObject({
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR' } },
    });
    expect(respond(new ToolError('UNKNOWN_TOOL', 'no'))).toMatchObject({
      status: 404,
      body: { error: { code: 'NOT_FOUND' } },
    });
    expect(respond(new ToolError('INVALID_OUTPUT', 'secret detail'))).toMatchObject({
      status: 500,
      body: { error: { code: 'INTERNAL', message: 'Internal error' } },
    });
  });
});
