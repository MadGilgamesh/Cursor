import { EXPEDITION_IDS, ERROR_CODES, type ExpeditionId } from '@game/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppDeps } from '../app.js';
import { playerActor } from '../audit.js';
import { currentAccount, requireAuth } from '../auth/plugin.js';
import type { Executor } from '../db/client.js';
import { characters, type CharacterRow } from '../db/schema.js';
import { AppError } from '../errors.js';
import { idempotent } from '../idempotency.js';
import {
  acceptEscort,
  createExpedition,
  endEscort,
  expeditionHall,
  joinExpedition,
  offerEscort,
  readyExpedition,
  resolveExpeditionRun,
  splitExpedition,
  startExpedition,
} from './expedition.js';

const expeditionIds = [...EXPEDITION_IDS] as [ExpeditionId, ...ExpeditionId[]];

async function characterOf(db: Executor, accountId: string): Promise<CharacterRow> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

/** Trasy Etapu 8. Mutacje wymagają Idempotency-Key. */
export function expeditionRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, clock } = deps;
  app.addHook('preHandler', requireAuth(deps));

  const mutate = (
    run: (tx: Executor, character: CharacterRow, request: FastifyRequest) => Promise<unknown>,
  ) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const account = currentAccount(request);
      return idempotent(db, request, reply, account.id, async (tx) => ({
        statusCode: 200,
        body: await run(tx, await characterOf(tx, account.id), request),
      }));
    };
  };

  app.get('/expeditions', async (request) => {
    const character = await characterOf(db, currentAccount(request).id);
    return expeditionHall(db, character, clock.now());
  });

  app.post(
    '/expeditions',
    mutate((tx, character, request) =>
      createExpedition(
        tx,
        playerActor(request, character.accountId),
        character,
        clock.now(),
        z.object({ expeditionId: z.enum(expeditionIds) }).parse(request.body).expeditionId,
      ),
    ),
  );

  app.post(
    '/expeditions/:id/join',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const assist = z.object({ assist: z.boolean().optional() }).parse(request.body ?? {}).assist;
      return joinExpedition(
        tx,
        playerActor(request, character.accountId),
        character,
        id,
        assist === true,
      );
    }),
  );

  app.post(
    '/expeditions/:id/ready',
    mutate((tx, character, request) =>
      readyExpedition(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ id: z.uuid() }).parse(request.params).id,
      ),
    ),
  );

  app.post(
    '/expeditions/:id/start',
    mutate((tx, character, request) =>
      startExpedition(
        tx,
        playerActor(request, character.accountId),
        character,
        clock.now(),
        z.object({ id: z.uuid() }).parse(request.params).id,
      ),
    ),
  );

  app.post(
    '/expeditions/:id/resolve',
    mutate((tx, character, request) =>
      resolveExpeditionRun(
        tx,
        playerActor(request, character.accountId),
        character,
        clock.now(),
        z.object({ id: z.uuid() }).parse(request.params).id,
      ),
    ),
  );

  app.post(
    '/expeditions/:id/split',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const body = z
        .object({
          shares: z.array(z.object({ characterId: z.uuid(), amount: z.int().min(0) })).min(1),
        })
        .parse(request.body);
      return splitExpedition(
        tx,
        playerActor(request, character.accountId),
        character,
        id,
        body.shares,
      );
    }),
  );

  app.post(
    '/escorts',
    mutate((tx, character, request) =>
      offerEscort(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ wardId: z.uuid() }).parse(request.body).wardId,
      ),
    ),
  );

  app.post(
    '/escorts/:id/accept',
    mutate((tx, character, request) =>
      acceptEscort(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ id: z.uuid() }).parse(request.params).id,
      ),
    ),
  );

  app.post(
    '/escorts/:id/end',
    mutate((tx, character, request) =>
      endEscort(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ id: z.uuid() }).parse(request.params).id,
      ),
    ),
  );
}
