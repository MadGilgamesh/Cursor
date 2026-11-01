import { ERROR_CODES, sessionResponseSchema, type ApiError } from '@game/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from '../../src/auth/session.js';
import { createTestApp, sessionCookie, uniqueAccount, type TestContext } from './harness.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('blokada konta z Kancelarii', () => {
  it('odcina logowanie i już otwartą sesję', async () => {
    const input = uniqueAccount();
    const registered = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: input,
    });
    expect(registered.statusCode).toBe(201);
    const body = sessionResponseSchema.parse(registered.json());
    const token = sessionCookie(registered);
    await ctx.db.execute(
      sql`insert into account_bans (account_id, reason) values (${body.account.id}::uuid, 'próba')`,
    );

    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: input.email, password: input.password },
    });
    expect(login.statusCode).toBe(403);
    expect(login.json<ApiError>().error.code).toBe(ERROR_CODES.accountBanned);

    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: { [SESSION_COOKIE]: token },
    });
    expect(me.statusCode).toBe(403);
    expect(me.json<ApiError>().error.code).toBe(ERROR_CODES.accountBanned);
  });
});
