import bcrypt from 'bcryptjs';

export const hashPassword = (password: string, rounds: number): Promise<string> =>
  bcrypt.hash(password, rounds);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 4);
