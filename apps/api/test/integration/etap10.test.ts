import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ManualClock } from '../../src/clock.js';
import { acts, characters, classProgress } from '../../src/db/schema.js';
import { call, createTestApp, registerPlayer, type TestContext } from './harness.js';

let ctx: TestContext;
const clock = new ManualClock(Date.UTC(2026, 9, 30, 12));

beforeAll(async () => {
  ctx = await createTestApp({ clock });
});

afterAll(async () => {
  await ctx.db.delete(acts);
  await ctx.close();
});

describe('Etap 10', () => {
  it('Zstąpienie od poziomu 60 składa Piętno i staje na dziesiątym', async () => {
    const player = await registerPlayer(ctx);
    await ctx.db.insert(classProgress).values({
      characterId: player.characterId,
      classId: 'butcher',
      level: 4,
      experience: 12,
    });
    await ctx.db.insert(classProgress).values({
      characterId: player.characterId,
      classId: 'marksman',
      level: 0,
      experience: 0,
    });
    await ctx.db.update(characters).set({ level: 59 }).where(eq(characters.id, player.characterId));
    const early = await call(ctx, player, 'POST', '/api/v1/descent', {
      body: { mark: 'training' },
    });
    expect(early.statusCode, early.body).toBe(409);

    for (let count = 1; count <= 10; count += 1) {
      await ctx.db
        .update(characters)
        .set({ level: 60 })
        .where(eq(characters.id, player.characterId));
      const response = await call(ctx, player, 'POST', '/api/v1/descent', {
        body: { mark: count === 2 ? 'mutation' : count === 3 ? 'constellation' : 'training' },
      });
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json<{
        level: number;
        descentCount: number;
        markTraining: number;
        markMutation: number;
        markConstellation: number;
        title: string | null;
      }>();
      expect(body.level).toBe(1);
      expect(body.descentCount).toBe(count);
      expect(body.title).toBe(`Piętno ${count}`);
    }
    const [row] = await ctx.db
      .select()
      .from(characters)
      .where(eq(characters.id, player.characterId))
      .limit(1);
    expect(row?.markTraining).toBe(8);
    expect(row?.markMutation).toBe(1);
    expect(row?.markConstellation).toBe(1);
    expect(row?.titles).toContain('Piętno 1');
    const classes = await ctx.db
      .select()
      .from(classProgress)
      .where(eq(classProgress.characterId, player.characterId));
    expect(classes.find((item) => item.classId === 'butcher')).toMatchObject({
      level: 1,
      experience: 0,
    });
    expect(classes.find((item) => item.classId === 'marksman')).toMatchObject({
      level: 0,
      experience: 0,
    });

    await ctx.db.update(characters).set({ level: 60 }).where(eq(characters.id, player.characterId));
    const full = await call(ctx, player, 'POST', '/api/v1/descent', {
      body: { mark: 'training' },
    });
    expect(full.statusCode, full.body).toBe(409);
  });

  it('Ys-Kahal bez Wiedzy odmawia zejścia', async () => {
    const player = await registerPlayer(ctx);
    await ctx.db.update(characters).set({ level: 55 }).where(eq(characters.id, player.characterId));
    const response = await call(ctx, player, 'POST', '/api/v1/expeditions', {
      body: { expeditionId: 'ys-kahal' },
    });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json<{ error: { message: string } }>().error.message).toBe('Za mało Wiedzy');
  });

  it('kolejny akt zeruje zegar i podnosi generację', async () => {
    const player = await registerPlayer(ctx);
    const started = await call(ctx, player, 'POST', '/api/v1/conjunction/start', {
      body: { pace: 'accelerated' },
    });
    expect(started.statusCode, started.body).toBe(200);
    await ctx.db.update(acts).set({ finale: 'repelled' }).where(eq(acts.id, 'current'));
    const next = await call(ctx, player, 'POST', '/api/v1/conjunction/next');
    expect(next.statusCode, next.body).toBe(200);
    expect(next.json<{ generation: number; clockBp: number; finale: string }>()).toMatchObject({
      generation: 2,
      clockBp: 0,
      finale: 'pending',
    });
  });
});
