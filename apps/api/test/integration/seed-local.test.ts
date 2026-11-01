import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestContext } from './harness.js';
import { accounts } from '../../src/db/schema.js';
import { seedLocalAdmin } from '../../src/db/seed-local.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

describe('seed lokalnego konta', () => {
  it('zakłada konto raz, loguje podanym loginem i nie rusza cudzego hasła', async () => {
    const login = `Gilgamesh${randomUUID().slice(0, 8)}`;
    const other = `Inny${randomUUID().slice(0, 8)}`;
    expect(await seedLocalAdmin(ctx.db, { login, password: 'admin', characterName: login })).toBe(
      'created',
    );
    const [first] = await ctx.db
      .select({ passwordHash: accounts.passwordHash })
      .from(accounts)
      .where(eq(accounts.email, login.toLowerCase()));
    expect(
      await seedLocalAdmin(ctx.db, { login, password: 'inne-haslo-xyz', characterName: login }),
    ).toBe('exists');
    const [again] = await ctx.db
      .select({ passwordHash: accounts.passwordHash })
      .from(accounts)
      .where(eq(accounts.email, login.toLowerCase()));
    expect(again?.passwordHash).toBe(first?.passwordHash);
    const duplicates = await ctx.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.email, login.toLowerCase()));
    expect(duplicates).toHaveLength(1);

    expect(
      await seedLocalAdmin(ctx.db, { login: other, password: 'admin', characterName: other }),
    ).toBe('created');
    await ctx.db
      .update(accounts)
      .set({ passwordHash: 'zostaw-to-haslo' })
      .where(eq(accounts.email, other.toLowerCase()));
    await seedLocalAdmin(ctx.db, { login, password: 'admin', characterName: login });
    const [untouched] = await ctx.db
      .select({ passwordHash: accounts.passwordHash })
      .from(accounts)
      .where(eq(accounts.email, other.toLowerCase()));
    expect(untouched?.passwordHash).toBe('zostaw-to-haslo');

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: login, password: 'admin' },
    });
    expect(response.statusCode).toBe(200);
  });
});
