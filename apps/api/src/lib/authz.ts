import { MESSAGES } from '../config/constants.js';
import { Role } from '@library/contracts';
import { forbidden } from './errors.js';
import type { Actor } from './route.js';

export const authorize = (actor: Actor, role: Role): void => {
  if (actor.role !== role) throw forbidden(MESSAGES.requiresRole(role));
};

export const authorizeOwner = (actor: Actor, userId: number): void => {
  if (actor.id !== userId) throw forbidden(MESSAGES.notYourRecord);
};

export const isLibrarian = (actor: Actor | null): boolean => actor?.role === Role.enum.LIBRARIAN;
