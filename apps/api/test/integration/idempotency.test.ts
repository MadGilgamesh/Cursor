import { randomUUID } from 'node:crypto';

import { ERROR_CODES, MINUTE_MS, type ApiError } from '@game/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ManualClock } from '../../src/clock.js';
import { idempotencyKeys, timedActivities, walletEntries } from '../../src/db/schema.js';
import { purgeExpiredIdempotencyKeys } from '../../src/idempotency.js';
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

const startBody = { missionId: 'order.quay-patrol' };

describe('idempotencja żądań (GDD 9.2)', () => {
  it('wymaga nagłówka Idempotency-Key dla akcji gry', async () => {
    const player = await registerPlayer(ctx);
    for (const idempotencyKey of [null, 'krótki', 'zły klucz ze spacjami']) {
      const response = await call(ctx, player, 'POST', '/api/v1/activities', {
        body: startBody,
        idempotencyKey,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<ApiError>().error.code).toBe(ERROR_CODES.idempotencyKeyRequired);
    }
  });

  it('powtórka z tym samym kluczem zwraca tę samą odpowiedź i nie powtarza akcji', async () => {
    const player = await registerPlayer(ctx);
    const idempotencyKey = randomUUID();
    const first = await call(ctx, player, 'POST', '/api/v1/activities', {
      body: startBody,
      idempotencyKey,
    });
    const replay = await call(ctx, player, 'POST', '/api/v1/activities', {
      body: startBody,
      idempotencyKey,
    });

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.json()).toEqual(first.json());

    const rows = await ctx.db
      .select()
      .from(timedActivities)
      .where(eq(timedActivities.characterId, player.characterId));
    expect(rows).toHaveLength(1);
  });

  it('powtórzony odbiór nagrody po zerwanym połączeniu nie wypłaca jej drugi raz', async () => {
    const player = await registerPlayer(ctx);
    const started = await call(ctx, player, 'POST', '/api/v1/activities', { body: startBody });
    const activityId = started.json<{ activity: { id: string } }>().activity.id;
    clock.advance(5 * MINUTE_MS);

    const idempotencyKey = randomUUID();
    const url = `/api/v1/activities/${activityId}/claim`;
    const first = await call(ctx, player, 'POST', url, { idempotencyKey });
    const retry = await call(ctx, player, 'POST', url, { idempotencyKey });
    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());

    const entries = await ctx.db
      .select()
      .from(walletEntries)
      .where(eq(walletEntries.characterId, player.characterId));
    expect(entries).toHaveLength(1);
  });

  it('ten sam klucz z inną treścią żądania jest odrzucany', async () => {
    const player = await registerPlayer(ctx);
    const idempotencyKey = randomUUID();
    await call(ctx, player, 'POST', '/api/v1/activities', { body: startBody, idempotencyKey });
    const reused = await call(ctx, player, 'POST', '/api/v1/activities', {
      body: { missionId: 'order.canal-hunt' },
      idempotencyKey,
    });
    expect(reused.statusCode).toBe(422);
    expect(reused.json<ApiError>().error.code).toBe(ERROR_CODES.idempotencyKeyReused);
  });

  it('błąd domenowy też jest zapamiętany i odtwarzany', async () => {
    const player = await registerPlayer(ctx);
    const idempotencyKey = randomUUID();
    const unknown = { missionId: 'nie.istnieje' };
    const first = await call(ctx, player, 'POST', '/api/v1/activities', {
      body: unknown,
      idempotencyKey,
    });
    const replay = await call(ctx, player, 'POST', '/api/v1/activities', {
      body: unknown,
      idempotencyKey,
    });
    expect(first.statusCode).toBe(404);
    expect(replay.statusCode).toBe(404);
    expect(replay.headers['idempotent-replayed']).toBe('true');
  });

  it('klucze są osobne dla każdego konta', async () => {
    const [a, b] = [await registerPlayer(ctx), await registerPlayer(ctx)];
    const idempotencyKey = randomUUID();
    expect(
      (await call(ctx, a, 'POST', '/api/v1/activities', { body: startBody, idempotencyKey }))
        .statusCode,
    ).toBe(201);
    const other = await call(ctx, b, 'POST', '/api/v1/activities', {
      body: startBody,
      idempotencyKey,
    });
    expect(other.statusCode).toBe(201);
    expect(other.headers['idempotent-replayed']).toBeUndefined();
  });

  it('zadanie konserwacyjne usuwa klucze starsze niż doba', async () => {
    const player = await registerPlayer(ctx);
    await call(ctx, player, 'POST', '/api/v1/activities', { body: startBody });
    const removed = await purgeExpiredIdempotencyKeys(
      ctx.db,
      new Date(Date.now() + 25 * 60 * MINUTE_MS),
    );
    expect(removed).toBeGreaterThanOrEqual(1);
    const left = await ctx.db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.accountId, player.accountId));
    expect(left).toEqual([]);
  });
});
