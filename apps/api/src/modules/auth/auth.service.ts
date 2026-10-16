import { AUDIT_ACTIONS, AuditEntityType, Role, ApiErrorCode } from '@library/contracts';
import { randomUUID } from 'node:crypto';
import type { LoginBody, RegisterBody, UserPublic } from '@library/contracts';
import { writeAudit } from '../../lib/audit.js';
import { conflict, unauthenticated } from '../../lib/errors.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/password.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { Actor } from '../../lib/route.js';
import { hashRefreshToken, newRefreshToken, signAccessToken } from '../../lib/tokens.js';
import type { TokenConfig } from '../../lib/tokens.js';

export interface AuthConfig extends TokenConfig {
  bcryptRounds: number;
}

export interface IssuedTokens {
  access: string;
  refresh: string;
}

export interface Session {
  user: UserPublic;
  tokens: IssuedTokens;
}

const INVALID_CREDENTIALS = 'Invalid email or password';

const toUserPublic = (row: {
  id: number;
  email: string;
  displayName: string;
  role: Role;
}): UserPublic => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  role: row.role,
});

export const createAuthService = (prisma: PrismaClient, config: AuthConfig) => {
  const issue = async (userId: number, familyId: string): Promise<IssuedTokens> => {
    const refresh = newRefreshToken();
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refresh.hash,
        familyId,
        expiresAt: new Date(Date.now() + config.refreshTtlSeconds * 1000),
      },
    });
    return { access: signAccessToken(userId, config), refresh: refresh.raw };
  };

  const revokeFamily = async (familyId: string): Promise<void> => {
    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  };

  return {
    async register(body: RegisterBody): Promise<Session> {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: body.email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing)
        throw conflict(ApiErrorCode.enum.EMAIL_TAKEN, 'An account with this email already exists');
      const passwordHash = await hashPassword(body.password, config.bcryptRounds);
      const user = await prisma.$transaction(async tx => {
        const row = await tx.user.create({
          data: {
            email: body.email,
            passwordHash,
            displayName: body.displayName,
            role: Role.enum.READER,
          },
        });
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.userRegister,
          entityType: AuditEntityType.enum.user,
          entityId: row.id,
          actorId: row.id,
          after: { email: row.email, role: row.role },
        });
        return row;
      });
      return { user: toUserPublic(user), tokens: await issue(user.id, randomUUID()) };
    },

    async login(body: LoginBody): Promise<Session> {
      const user = await prisma.user.findFirst({
        where: { email: { equals: body.email, mode: 'insensitive' } },
      });
      const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !ok || user.disabledAt !== null) throw unauthenticated(INVALID_CREDENTIALS);
      return { user: toUserPublic(user), tokens: await issue(user.id, randomUUID()) };
    },

    async refresh(rawToken: string): Promise<Session> {
      const record = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(rawToken) },
        include: { user: true },
      });
      if (!record) throw unauthenticated('Invalid refresh token');
      if (record.revokedAt !== null) {
        await revokeFamily(record.familyId);
        throw unauthenticated('Refresh token reuse detected');
      }
      if (record.expiresAt < new Date() || record.user.disabledAt !== null) {
        await revokeFamily(record.familyId);
        throw unauthenticated('Refresh token expired');
      }
      const tokens = await issue(record.userId, record.familyId);
      const replacement = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(tokens.refresh) },
        select: { id: true },
      });
      await prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date(), replacedById: replacement?.id ?? null },
      });
      return { user: toUserPublic(record.user), tokens };
    },

    async logout(rawToken: string | undefined): Promise<void> {
      if (rawToken === undefined) return;
      const record = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(rawToken) },
        select: { familyId: true },
      });
      if (record) await revokeFamily(record.familyId);
    },

    async me(actor: Actor): Promise<UserPublic> {
      const user = await prisma.user.findUnique({ where: { id: actor.id } });
      if (!user || user.disabledAt !== null) throw unauthenticated();
      return toUserPublic(user);
    },

    async disable(actor: Actor): Promise<void> {
      await prisma.$transaction(async tx => {
        await tx.user.update({ where: { id: actor.id }, data: { disabledAt: new Date() } });
        await tx.refreshToken.updateMany({
          where: { userId: actor.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await writeAudit(tx, {
          action: AUDIT_ACTIONS.userDisable,
          entityType: AuditEntityType.enum.user,
          entityId: actor.id,
          after: { disabled: true },
        });
      });
    },
  };
};

export type AuthService = ReturnType<typeof createAuthService>;
