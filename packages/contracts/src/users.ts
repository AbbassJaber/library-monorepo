import { z } from 'zod';
import { Id, Role } from './common.js';

export const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const UserPublic = z
  .object({
    id: Id,
    email: z.string(),
    displayName: z.string(),
    role: Role,
  })
  .meta({ id: 'UserPublic' });
export type UserPublic = z.infer<typeof UserPublic>;
