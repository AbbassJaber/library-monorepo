import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface PendingPayload {
  tool: string;
  input: unknown;
  actorId: number;
  actionId?: string;
  exp: number;
  nonce: string;
}

export const CONFIRM_TTL_MS = 10 * 60 * 1000;

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
        )
      : inner
  );

const sign = (secret: string, body: string): string =>
  createHmac('sha256', secret).update(body).digest('base64url');

export const issueConfirmToken = (
  secret: string,
  payload: Omit<PendingPayload, 'exp' | 'nonce'>,
  now = Date.now()
): { token: string; expiresAt: string } => {
  const full: PendingPayload = {
    ...payload,
    exp: now + CONFIRM_TTL_MS,
    nonce: randomBytes(8).toString('base64url'),
  };
  const body = Buffer.from(canonical(full)).toString('base64url');
  return { token: `${body}.${sign(secret, body)}`, expiresAt: new Date(full.exp).toISOString() };
};

export type ConfirmFailure = 'malformed' | 'bad-signature' | 'expired' | 'wrong-actor';

export const verifyConfirmToken = (
  secret: string,
  token: string,
  actorId: number,
  now = Date.now()
): { ok: true; payload: PendingPayload } | { ok: false; reason: ConfirmFailure } => {
  const [body, signature] = token.split('.');
  if (!body || !signature) return { ok: false, reason: 'malformed' };
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return { ok: false, reason: 'bad-signature' };
  let payload: PendingPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as PendingPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.exp <= now) return { ok: false, reason: 'expired' };
  if (payload.actorId !== actorId) return { ok: false, reason: 'wrong-actor' };
  return { ok: true, payload };
};
