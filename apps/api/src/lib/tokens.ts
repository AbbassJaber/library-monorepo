import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from './prisma.js';

export interface TokenConfig {
  accessSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

const ISSUER = 'library-api';

export const signAccessToken = (userId: number, config: TokenConfig): string =>
  jwt.sign({}, config.accessSecret, {
    algorithm: 'HS256',
    subject: String(userId),
    issuer: ISSUER,
    expiresIn: config.accessTtlSeconds,
  });

export const verifyAccessToken = (token: string, config: TokenConfig): number | null => {
  try {
    const payload = jwt.verify(token, config.accessSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
    });
    const sub = typeof payload === 'object' && payload !== null ? payload.sub : undefined;
    const id = Number(sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

export const newRefreshToken = (): { raw: string; hash: string } => {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashRefreshToken(raw) };
};

export const hashRefreshToken = (raw: string): string =>
  createHash('sha256').update(raw).digest('hex');

export const REVOKED_GRACE_MS = 24 * 60 * 60 * 1000;

export const pruneExpiredTokens = async (
  prisma: PrismaClient,
  now = new Date()
): Promise<number> => {
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { revokedAt: { lt: new Date(now.getTime() - REVOKED_GRACE_MS) } },
      ],
    },
  });
  return count;
};
