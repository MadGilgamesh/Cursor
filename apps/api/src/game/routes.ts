import { ERROR_CODES, startMissionRequestSchema, type DashboardResponse } from '@game/shared';
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
import { loadResources, materializeAll, resourceContext, toResourcesDto } from './resources.js';
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
    const ctx = resourceContext(character.level);
    const resources = materializeAll(await loadResources(db, character.id), ctx, now);
    return {
      serverTime: now.toISOString(),
      character: toCharacterDto(character),
      resources: toResourcesDto(resources, ctx),
      wallet: await walletOf(db, character.id),
      activities: (await openActivities(db, character.id)).map(toActivityDto),
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
