import { randomUUID } from 'node:crypto';

import {
  claimResponseSchema,
  dashboardResponseSchema,
  ERROR_CODES,
  MINUTE_MS,
  startActivityResponseSchema,
  type ApiError,
} from '@game/shared';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ManualClock } from '../../src/clock.js';
import { auditLog, timedActivities, walletEntries } from '../../src/db/schema.js';
import { call, createTestApp, registerPlayer, virtualClock, type TestContext } from './harness.js';

let ctx: TestContext;
let clock: ManualClock;

beforeAll(async () => {
  clock = virtualClock();
  ctx = await createTestApp({ clock });
});

afterAll(async () => {
  await ctx.close();
});

type Player = Awaited<ReturnType<typeof registerPlayer>>;

const start = (player: Player, missionId = 'trial.wreck-search', idempotencyKey?: string) =>
  call(ctx, player, 'POST', '/api/v1/activities', {
    body: { missionId },
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

const claim = (player: Player, activityId: string) =>
  call(ctx, player, 'POST', `/api/v1/activities/${activityId}/claim`);

describe('cykl zlecenia', () => {
  it('start → trwa → rozstrzygnięcie → odbiór nagrody z księgą i audytem', async () => {
    const player = await registerPlayer(ctx);
    const started = startActivityResponseSchema.parse(
      (await start(player, 'trial.amber-ebb')).json(),
    );
    expect(started.activity).toMatchObject({
      status: 'active',
      result: null,
      defId: 'trial.amber-ebb',
    });
    expect(Date.parse(started.activity.endAt) - Date.parse(started.activity.startAt)).toBe(
      60 * MINUTE_MS,
    );

    const tooEarly = await claim(player, started.activity.id);
    expect(tooEarly.statusCode).toBe(409);
    expect(tooEarly.json<ApiError>().error.code).toBe(ERROR_CODES.activityNotReady);

    clock.advance(60 * MINUTE_MS);
    const board = dashboardResponseSchema.parse(
      (await call(ctx, player, 'GET', '/api/v1/dashboard')).json(),
    );
    const [ready] = board.activities;
    expect(ready?.status).toBe('completed');
    expect(ready?.result).toMatchObject({ experience: 144, silver: 10 });

    const claimed = claimResponseSchema.parse((await claim(player, started.activity.id)).json());
    expect(claimed.wallet.silver).toBe(10);
    // 144 XP na poziomie 1 (progi 37, potem 108) → poziom 2 ze 107 XP.
    expect(claimed.character).toMatchObject({ level: 2, experience: 107 });
    // Awans podnosi maksimum Życia (GDD 10.1).
    expect(claimed.resources.life.max).toBe(120);

    const again = await claim(player, started.activity.id);
    expect(again.statusCode).toBe(409);
    expect(again.json<ApiError>().error.code).toBe(ERROR_CODES.activityAlreadyClaimed);

    const entries = await ctx.db
      .select()
      .from(walletEntries)
      .where(eq(walletEntries.characterId, player.characterId));
    expect(entries).toEqual([
      expect.objectContaining({
        currency: 'silver',
        delta: 10,
        balanceAfter: 10,
        reason: 'activity.reward',
        refId: started.activity.id,
      }),
    ]);

    const audit = await ctx.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.characterId, player.characterId))
      .orderBy(asc(auditLog.createdAt));
    expect(audit.map((entry) => entry.action)).toEqual([
      'account.register',
      'activity.start',
      'activity.claim',
    ]);
    expect(audit[1]).toMatchObject({
      actor: 'player',
      before: { vigor: 100 },
      after: { vigor: 80 },
    });
    expect(audit[2]?.after).toMatchObject({ level: 2, silver: 10 });
    expect(audit[2]?.ip).toBeTruthy();
  });

  it('wynik zależy od ziarna zapisanego przy starcie, a ziarno nie wycieka do klienta', async () => {
    const player = await registerPlayer(ctx);
    const response = await start(player, 'trial.kelp-harvest');
    expect(response.body).not.toContain('seed');
    const { activity } = startActivityResponseSchema.parse(response.json());
    const [row] = await ctx.db
      .select()
      .from(timedActivities)
      .where(eq(timedActivities.id, activity.id));
    expect(row?.resultSeed).toMatch(/^[\w-]{22}$/);
    expect(row?.balanceVersion).toBe(1);
  });

  it('pozwala na jedno nieodebrane zlecenie naraz', async () => {
    const player = await registerPlayer(ctx);
    expect((await start(player)).statusCode).toBe(201);
    const second = await start(player, 'trial.kelp-harvest');
    expect(second.statusCode).toBe(409);
    expect(second.json<ApiError>().error.code).toBe(ERROR_CODES.activityBusy);
  });

  it('odrzuca nieznane zlecenie i cudzą aktywność', async () => {
    const owner = await registerPlayer(ctx);
    const stranger = await registerPlayer(ctx);
    expect((await start(owner, 'nie.istnieje')).statusCode).toBe(404);

    const { activity } = startActivityResponseSchema.parse((await start(owner)).json());
    clock.advance(5 * MINUTE_MS);
    expect((await claim(stranger, activity.id)).statusCode).toBe(404);
  });

  it('„odbierz wszystko” rozlicza gotowe zlecenia i jest bezpieczne, gdy nic nie ma', async () => {
    const player = await registerPlayer(ctx);
    const empty = claimResponseSchema.parse(
      (await call(ctx, player, 'POST', '/api/v1/activities/claim-all')).json(),
    );
    expect(empty.claimed).toEqual([]);

    await start(player);
    clock.advance(5 * MINUTE_MS);
    const all = claimResponseSchema.parse(
      (await call(ctx, player, 'POST', '/api/v1/activities/claim-all')).json(),
    );
    expect(all.claimed).toHaveLength(1);
    expect(all.wallet.silver).toBe(3);
  });
});

describe('współbieżność (GDD 9.2: brak double-spend)', () => {
  it('równoległe starty z różnymi kluczami: jedno zlecenie i jedna opłata Wigoru', async () => {
    const player = await registerPlayer(ctx);
    const responses = await Promise.all(Array.from({ length: 6 }, () => start(player)));
    const codes = responses.map((response) => response.statusCode).sort();
    expect(codes.filter((code) => code === 201)).toHaveLength(1);
    expect(codes.filter((code) => code === 409)).toHaveLength(5);

    const board = dashboardResponseSchema.parse(
      (await call(ctx, player, 'GET', '/api/v1/dashboard')).json(),
    );
    expect(board.resources.vigor.value).toBe(95);
  });

  it('równoległe odbiory: nagroda wypłacona dokładnie raz', async () => {
    const player = await registerPlayer(ctx);
    const { activity } = startActivityResponseSchema.parse(
      (await start(player, 'trial.amber-ebb')).json(),
    );
    clock.advance(60 * MINUTE_MS);

    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        i % 2 === 0
          ? claim(player, activity.id)
          : call(ctx, player, 'POST', '/api/v1/activities/claim-all', {
              idempotencyKey: randomUUID(),
            }),
      ),
    );
    const unexpected = responses.filter((r) => ![200, 409].includes(r.statusCode));
    expect(unexpected.map((r) => `${r.statusCode} ${r.body}`)).toEqual([]);

    const entries = await ctx.db
      .select()
      .from(walletEntries)
      .where(eq(walletEntries.characterId, player.characterId));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.balanceAfter).toBe(10);
  });
});
