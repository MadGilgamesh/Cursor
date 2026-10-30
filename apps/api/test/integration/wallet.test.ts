import { eq, sum } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { walletEntries } from '../../src/db/schema.js';
import { balanceOf, InsufficientFundsError, postLedgerEntry } from '../../src/game/wallet.js';
import { createTestApp, registerPlayer, type TestContext } from './harness.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

const entry = (characterId: string, delta: number, idempotencyKey: string) =>
  ctx.db.transaction((tx) =>
    postLedgerEntry(tx, { characterId, currency: 'silver', delta, reason: 'test', idempotencyKey }),
  );

describe('księga walut (GDD 8.2 WalletEntry)', () => {
  it('saldo to suma wpisów, a każdy wpis zapisuje saldo po operacji', async () => {
    const { characterId } = await registerPlayer(ctx);
    await entry(characterId, 100, 'a');
    await entry(characterId, -30, 'b');
    await entry(characterId, 5, 'c');

    const rows = await ctx.db
      .select()
      .from(walletEntries)
      .where(eq(walletEntries.characterId, characterId));
    expect(rows.map((row) => row.balanceAfter)).toEqual([100, 70, 75]);
    const [total] = await ctx.db
      .select({ total: sum(walletEntries.delta) })
      .from(walletEntries)
      .where(eq(walletEntries.characterId, characterId));
    expect(Number(total?.total)).toBe(75);
    expect(await balanceOf(ctx.db, characterId, 'silver')).toBe(75);
  });

  it('powtórzony klucz idempotencji nie tworzy drugiego wpisu', async () => {
    const { characterId } = await registerPlayer(ctx);
    const first = await entry(characterId, 50, 'nagroda-1');
    const second = await entry(characterId, 50, 'nagroda-1');
    expect(second.seq).toBe(first.seq);
    expect(await balanceOf(ctx.db, characterId, 'silver')).toBe(50);
  });

  it('nie pozwala zejść poniżej zera ani dodać zerowej zmiany', async () => {
    const { characterId } = await registerPlayer(ctx);
    await entry(characterId, 10, 'start');
    await expect(entry(characterId, -11, 'za-dużo')).rejects.toBeInstanceOf(InsufficientFundsError);
    await expect(entry(characterId, 0, 'zero')).rejects.toBeInstanceOf(RangeError);
    expect(await balanceOf(ctx.db, characterId, 'silver')).toBe(10);
  });

  it('równoległe wydatki nigdy nie przekraczają salda (blokada wiersza postaci)', async () => {
    const { characterId } = await registerPlayer(ctx);
    await entry(characterId, 100, 'zasilenie');
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => entry(characterId, -30, `wydatek-${i}`)),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    expect(await balanceOf(ctx.db, characterId, 'silver')).toBe(10);
  });
});
