import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../../src/auth/password.js';
import { generateSessionToken, hashSessionToken } from '../../src/auth/session.js';

describe('hasła', () => {
  it('hashuje Argon2id i weryfikuje poprawne hasło', async () => {
    const hash = await hashPassword('Ulthaeg śni pod falą');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'Ulthaeg śni pod falą')).toBe(true);
    expect(await verifyPassword(hash, 'inne hasło')).toBe(false);
  });

  it('nie rzuca wyjątku dla uszkodzonego skrótu', async () => {
    expect(await verifyPassword('to-nie-jest-skrót', 'hasło')).toBe(false);
  });
});

describe('tokeny sesji', () => {
  it('generuje losowe tokeny o wysokiej entropii', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateSessionToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[\w-]{43}$/);
  });

  it('skrót tokenu jest deterministyczny i nie zawiera tokenu', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
  });
});
