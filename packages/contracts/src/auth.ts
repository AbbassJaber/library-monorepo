import { z } from 'zod';
import { Email, UserPublic } from './users.js';

export const PASSWORD_MIN_LENGTH = 8;

const Password = z.string().min(PASSWORD_MIN_LENGTH).max(128);

export const RegisterBody = z
  .strictObject({
    email: Email,
    password: Password,
    displayName: z.string().trim().min(1).max(80),
  })
  .meta({ id: 'RegisterBody' });
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z
  .strictObject({
    email: Email,
    password: z.string().min(1).max(128),
  })
  .meta({ id: 'LoginBody' });
export type LoginBody = z.infer<typeof LoginBody>;

export const RefreshBody = z
  .strictObject({
    refreshToken: z.string().min(1).optional(),
  })
  .meta({ id: 'RefreshBody' });
export type RefreshBody = z.infer<typeof RefreshBody>;

export const AuthResponse = z
  .object({
    user: UserPublic,
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
  })
  .meta({ id: 'AuthResponse' });
export type AuthResponse = z.infer<typeof AuthResponse>;

export const MeResponse = UserPublic;
export type MeResponse = z.infer<typeof MeResponse>;
