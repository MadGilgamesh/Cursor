import {
  ERROR_CODES,
  dreamKeyCount,
  keyRegenIntervalMs,
  nextPortalFight,
  patronActive,
  portalUnitName,
  resourceMax,
  startMissionRequestSchema,
  type DashboardResponse,
} from '@game/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppDeps } from '../app.js';
import { playerActor } from '../audit.js';
import { currentAccount, requireAuth } from '../auth/plugin.js';
import type { Executor } from '../db/client.js';
import { characters } from '../db/schema.js';
import { AppError } from '../errors.js';
import { idempotent } from '../idempotency.js';
import { toCharacterDto } from '../serializers.js';
import {
  claimActivities,
  openActivities,
  resolveDueActivities,
  startMission,
  toActivityDto,
} from './activities.js';
import { loreHomeFrom } from './lore.js';
import { worldOf } from './world.js';
import { loadLore, loreExtras } from './lore-state.js';
import {
  houseRegenBp,
  loadResources,
  materializeAll,
  resourceContext,
  toResourcesDto,
} from './resources.js';
import { loadPortal, materializePortal, ringOf } from './portal-state.js';
import { walletOf } from './wallet.js';

async function characterOf(db: Executor, accountId: string) {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

const activityParamsSchema = z.object({ id: z.uuid() });

/** Stan gry i akcje gracza. Każda akcja mutująca wymaga nagłówka Idempotency-Key. */
export function gameRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, clock } = deps;
  app.addHook('preHandler', requireAuth(deps));

  app.get('/dashboard', async (request): Promise<DashboardResponse> => {
    const account = currentAccount(request);
    const { id: characterId } = await characterOf(db, account.id);
    // Pulpit rozstrzyga zakończone timery od razu, nie czekając na worker.
    await resolveDueActivities(deps, { characterId });
    const character = await characterOf(db, account.id);
    const now = clock.now();
    const lore = await loadLore(db, character.id);
    const extras = loreExtras(lore);
    const patron = patronActive(character.patronUntil?.getTime() ?? null, now.getTime());
    const ctx = resourceContext(character.level, extras.knowledge, extras.sanityPenalty, patron);
    const house = await houseRegenBp(db, character.id, now);
    const resources = await materializeAll(
      db,
      character.id,
      await loadResources(db, character.id),
      ctx,
      now,
    );
    const portalRow = materializePortal(
      await loadPortal(db, character.id),
      now,
      keyRegenIntervalMs(patron),
    );
    const ring = ringOf(portalRow);
    const next = nextPortalFight({
      domain: portalRow.clearedDomain,
      stage: portalRow.clearedStage,
      substage: portalRow.clearedSubstage,
    });
    return {
      serverTime: now.toISOString(),
      character: toCharacterDto(character),
      resources: toResourcesDto(resources, ctx),
      regen: {
        patron,
        vigorRegenBp: house.vigorRegenBp,
        sanityRegenBp: house.sanityRegenBp,
      },
      wallet: await walletOf(db, character.id),
      activities: (await openActivities(db, character.id)).map(toActivityDto),
      portal: {
        regenKeys: ring.regenKeys,
        lootKeys: ring.lootKeys,
        shards: ring.shards,
        totalKeys: dreamKeyCount(ring),
        nextDomain: next.domain,
        nextStage: next.stage,
        nextSubstage: next.substage,
        nextName: portalUnitName(next.domain, next.stage),
        wellFloor: portalRow.wellFloor,
        candles: portalRow.candles,
      },
      lore: loreHomeFrom(lore, portalRow, resources.sanity.value, resourceMax('sanity', ctx), now),
      world: (await worldOf(db, character, clock)).home,
    };
  });

  app.post('/activities', async (request, reply) => {
    const account = currentAccount(request);
    const input = startMissionRequestSchema.parse(request.body);
    return idempotent(db, request, reply, account.id, async (tx) => {
      const character = await characterOf(tx, account.id);
      const body = await startMission(
        { db: tx, clock },
        playerActor(request, account.id),
        character.id,
        input.missionId,
        input.loop,
      );
      return { statusCode: 201, body };
    });
  });

  app.post('/activities/claim-all', async (request, reply) => {
    const account = currentAccount(request);
    return idempotent(db, request, reply, account.id, async (tx) => {
      const character = await characterOf(tx, account.id);
      const body = await claimActivities(
        { db: tx, clock },
        playerActor(request, account.id),
        character.id,
        'all',
      );
      return { statusCode: 200, body };
    });
  });

  app.post('/activities/:id/claim', async (request, reply) => {
    const account = currentAccount(request);
    const { id } = activityParamsSchema.parse(request.params);
    return idempotent(db, request, reply, account.id, async (tx) => {
      const character = await characterOf(tx, account.id);
      const body = await claimActivities(
        { db: tx, clock },
        playerActor(request, account.id),
        character.id,
        { activityId: id },
      );
      return { statusCode: 200, body };
    });
  });
}
