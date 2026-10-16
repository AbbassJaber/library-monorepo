import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONFIRM_TTL_MS, issueConfirmToken, verifyConfirmToken } from './confirmToken.js';

const secret = 'test-secret-test-secret';
const now = 1_700_000_000_000;
const issue = (actorId = 1, input: unknown = { bookId: 3, state: 'READING' }) =>
  issueConfirmToken(secret, { tool: 'addToReadingList', input, actorId }, now).token;

const decode = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as Record<string, unknown>;
const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString('base64url');

describe('confirm token: tampering', () => {
  it('a payload edited to another input, tool or actor no longer matches its signature', () => {
    const token = issue();
    const signature = token.split('.')[1]!;
    for (const edit of [
      { input: { bookId: 999, state: 'READING' } },
      { tool: 'updateReadingState' },
      { actorId: 2 },
      { exp: now + 365 * 24 * 3600 * 1000 },
    ]) {
      const forged = `${encode({ ...decode(token), ...edit })}.${signature}`;
      expect(verifyConfirmToken(secret, forged, 1, now)).toEqual({
        ok: false,
        reason: 'bad-signature',
      });
    }
  });

  it("a signature lifted from another actor's token is refused", () => {
    const mine = issue(1);
    const theirs = issue(2);
    const spliced = `${mine.split('.')[0]}.${theirs.split('.')[1]}`;
    expect(verifyConfirmToken(secret, spliced, 1, now)).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('a token signed with another secret, a truncated signature or missing parts is refused', () => {
    const token = issue();
    expect(verifyConfirmToken('another-secret', token, 1, now).ok).toBe(false);
    expect(verifyConfirmToken(secret, token.slice(0, -3), 1, now)).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
    for (const broken of ['', '.', `${token.split('.')[0]}.`, `.${token.split('.')[1]}`])
      expect(verifyConfirmToken(secret, broken, 1, now)).toEqual({
        ok: false,
        reason: 'malformed',
      });
  });

  it('a correctly signed body that is not JSON is malformed, not a crash', () => {
    const body = Buffer.from('not json at all').toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');
    expect(verifyConfirmToken(secret, `${body}.${signature}`, 1, now)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('confirm token: expiry and actor', () => {
  it('is valid until just before its expiry and refused from the expiry instant on', () => {
    const token = issue();
    expect(verifyConfirmToken(secret, token, 1, now + CONFIRM_TTL_MS - 1).ok).toBe(true);
    expect(verifyConfirmToken(secret, token, 1, now + CONFIRM_TTL_MS)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('only the actor it was issued to can confirm it, and the canonical input comes from the token', () => {
    const token = issue(7, { state: 'READING', bookId: 3 });
    expect(verifyConfirmToken(secret, token, 8, now)).toEqual({ ok: false, reason: 'wrong-actor' });
    const verified = verifyConfirmToken(secret, token, 7, now);
    expect(verified.ok && verified.payload.input).toEqual({ bookId: 3, state: 'READING' });
  });

  it('two tokens for the same action differ (nonce), so one cannot be predicted from another', () => {
    expect(issue()).not.toBe(issue());
  });
});
