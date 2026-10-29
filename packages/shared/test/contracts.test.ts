import { describe, expect, it } from 'vitest';

import { loginRequestSchema, registerRequestSchema } from '../src/contracts.js';

describe('registerRequestSchema', () => {
  it('normalizuje e-mail i imię postaci', () => {
    const parsed = registerRequestSchema.parse({
      email: '  Latarnik@Sol.PL ',
      characterName: ' Łowca_Głębin ',
      password: 'bardzo-tajne-hasło',
    });
    expect(parsed.email).toBe('latarnik@sol.pl');
    expect(parsed.characterName).toBe('Łowca_Głębin');
  });

  it('odrzuca słabe dane', () => {
    const result = registerRequestSchema.safeParse({
      email: 'to-nie-email',
      characterName: 'a b',
      password: 'krótkie',
    });
    expect(result.success).toBe(false);
    const fields = result.error?.issues.map((issue) => issue.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['email', 'characterName', 'password']));
  });
});

describe('loginRequestSchema', () => {
  it('wymaga hasła', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.pl', password: '' }).success).toBe(false);
  });
});
