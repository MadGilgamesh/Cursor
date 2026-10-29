import { randomInt } from 'node:crypto';

import { ERROR_CODES, sessionResponseSchema, type ApiError } from '@game/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from '../../src/auth/session.js';
import { ManualClock } from '../../src/clock.js';
import { createTestApp, sessionCookie, uniqueAccount, type TestContext } from './harness.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

const register = (body: object, target = ctx) =>
  target.app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: body });
const login = (body: object) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: body });
const me = (token?: string, target = ctx) =>
  target.app.inject({
    method: 'GET',
    url: '/api/v1/me',
    ...(token ? { cookies: { [SESSION_COOKIE]: token } } : {}),
  });

describe('rejestracja', () => {
  it('tworzy konto z dokładnie jedną postacią i sesję', async () => {
    const input = uniqueAccount();
    const response = await register(input);

    expect(response.statusCode).toBe(201);
    const body = sessionResponseSchema.parse(response.json());
    expect(body.character).toMatchObject({ name: input.characterName, level: 1, experience: 0 });

    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api' });

    const profile = sessionResponseSchema.parse((await me(sessionCookie(response))).json());
    expect(profile).toEqual(body);
  });

  it('nie ujawnia skrótu hasła ani e-maila', async () => {
    const response = await register(uniqueAccount());
    expect(response.body).not.toContain('password');
    expect(response.body).not.toContain('@sol.test');
  });

  it('odrzuca zajęty e-mail (bez względu na wielkość liter)', async () => {
    const input = uniqueAccount();
    expect((await register(input)).statusCode).toBe(201);
    const duplicate = await register({ ...uniqueAccount(), email: input.email.toUpperCase() });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<ApiError>().error.code).toBe(ERROR_CODES.emailTaken);
  });

  it('odrzuca zajęte imię postaci (bez względu na wielkość liter) i nie zostawia osieroconego konta', async () => {
    const input = uniqueAccount();
    expect((await register(input)).statusCode).toBe(201);
    const second = uniqueAccount();
    const duplicate = await register({
      ...second,
      characterName: input.characterName.toLowerCase(),
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<ApiError>().error.code).toBe(ERROR_CODES.characterNameTaken);

    // Transakcja została wycofana, więc ten e-mail nadal jest wolny.
    expect((await register(second)).statusCode).toBe(201);
  });

  it('waliduje dane wejściowe', async () => {
    const response = await register({ email: 'zły', characterName: 'x', password: '1' });
    expect(response.statusCode).toBe(400);
    expect(response.json<ApiError>().error.code).toBe(ERROR_CODES.validation);
  });

  it('odrzuca żądania inne niż JSON', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'email=a@b.pl',
    });
    expect(response.statusCode).toBe(415);
  });
});

describe('logowanie i wylogowanie', () => {
  it('loguje poprawnymi danymi i unieważnia sesję po wylogowaniu', async () => {
    const input = uniqueAccount();
    await register(input);

    const loggedIn = await login({ email: input.email, password: input.password });
    expect(loggedIn.statusCode).toBe(200);
    expect(sessionResponseSchema.parse(loggedIn.json()).character.name).toBe(input.characterName);
    const token = sessionCookie(loggedIn);
    expect((await me(token)).statusCode).toBe(200);

    const loggedOut = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { [SESSION_COOKIE]: token },
    });
    expect(loggedOut.statusCode).toBe(204);
    expect((await me(token)).statusCode).toBe(401);
  });

  it('zwraca ten sam błąd dla złego hasła i nieistniejącego konta', async () => {
    const input = uniqueAccount();
    await register(input);

    const wrongPassword = await login({ email: input.email, password: 'złe-hasło-123' });
    const unknownEmail = await login({ email: 'nikt@sol.test', password: 'cokolwiek-123' });

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.statusCode).toBe(401);
      expect(response.json<ApiError>().error.code).toBe(ERROR_CODES.invalidCredentials);
    }
  });

  it('odrzuca dostęp bez sesji lub z fałszywym tokenem', async () => {
    expect((await me()).statusCode).toBe(401);
    expect((await me('fałszywy-token')).statusCode).toBe(401);
  });
});

describe('wygasanie sesji (wirtualny zegar serwera)', () => {
  it('sesja działa do końca TTL i wygasa po nim', async () => {
    // Zegar startuje w teraźniejszości, bo sesja w bazie ma znacznik z czasu serwera aplikacji.
    const clock = new ManualClock();
    const ttlMs = 60 * 60 * 1000;
    const timed = await createTestApp({ clock, config: { sessionTtlMs: ttlMs } });
    try {
      const token = sessionCookie(await register(uniqueAccount(), timed));
      clock.advance(ttlMs - 1_000);
      expect((await me(token, timed)).statusCode).toBe(200);
      clock.advance(2_000);
      expect((await me(token, timed)).statusCode).toBe(401);
    } finally {
      await timed.close();
    }
  });
});

describe('limit prób logowania', () => {
  it('zwraca 429 po przekroczeniu limitu dla jednego IP', async () => {
    const limited = await createTestApp({ config: { authRateLimitMax: 3 } });
    try {
      const remoteAddress = `10.${randomInt(255)}.${randomInt(255)}.${randomInt(1, 255)}`;
      const attempt = () =>
        limited.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          remoteAddress,
          payload: { email: 'nikt@sol.test', password: 'cokolwiek-123' },
        });
      for (let i = 0; i < 3; i++) expect((await attempt()).statusCode).toBe(401);
      const blocked = await attempt();
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json<ApiError>().error.code).toBe(ERROR_CODES.rateLimited);
    } finally {
      await limited.close();
    }
  });
});
