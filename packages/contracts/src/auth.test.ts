import { describe, expect, it } from 'vitest';
import { LoginBody, RegisterBody } from './auth.js';

describe('RegisterBody', () => {
  const valid = { email: 'Reader@Example.com', password: 'Password123!', displayName: 'Reader' };

  it('lowercases and trims the email', () => {
    expect(RegisterBody.parse({ ...valid, email: '  Reader@Example.com ' }).email).toBe(
      'reader@example.com'
    );
  });

  it('rejects a role field so nobody can register as a librarian', () => {
    const result = RegisterBody.safeParse({ ...valid, role: 'LIBRARIAN' });
    expect(result.success).toBe(false);
  });

  it('requires a password of at least 8 characters', () => {
    expect(RegisterBody.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });

  it('requires a display name between 1 and 80 characters', () => {
    expect(RegisterBody.safeParse({ ...valid, displayName: '' }).success).toBe(false);
    expect(RegisterBody.safeParse({ ...valid, displayName: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('LoginBody', () => {
  it('requires email and password', () => {
    expect(LoginBody.safeParse({ email: 'a@b.co' }).success).toBe(false);
    expect(LoginBody.parse({ email: 'A@B.CO', password: 'whatever' }).email).toBe('a@b.co');
  });
});
