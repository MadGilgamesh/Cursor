import { ERROR_CODES, WELL_WHISPERS } from '@game/shared';
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
  activateEcho,
  chooseWhisper,
  decomposeItem,
  engraveKey,
  fightPortal,
  fightWell,
  holdSeance,
  portalOf,
} from './portal.js';

async function characterOf(db: Executor, accountId: string): Promise<CharacterRow> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

const coordSchema = z.object({
  domain: z.int().min(1).max(11),
  stage: z.int().min(1).max(10),
  substage: z.int().min(1).max(8),
});
const whisperSchema = z.object({ whisper: z.enum(WELL_WHISPERS) });
const echoSchema = z.object({ echoId: z.string().min(1).max(80) });
const itemSchema = z.object({ itemId: z.uuid() });

/** Trasy Etapu 2. Każda mutacja wymaga nagłówka Idempotency-Key (`requestId`). */
export function portalRoutes(app: FastifyInstance, deps: AppDeps): void {
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

  app.get('/portal', async (request) =>
    portalOf(db, await characterOf(db, currentAccount(request).id), clock),
  );

  app.post(
    '/portal/fight',
    mutate((tx, character, request) =>
      fightPortal(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        coordSchema.parse(request.body),
      ),
    ),
  );
  app.post(
    '/portal/engrave',
    mutate((tx, character, request) =>
      engraveKey(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/well/whisper',
    mutate((tx, character, request) =>
      chooseWhisper(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        whisperSchema.parse(request.body).whisper,
      ),
    ),
  );
  app.post(
    '/well/fight',
    mutate((tx, character, request) =>
      fightWell(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/seance',
    mutate((tx, character, request) =>
      holdSeance(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/echo/activate',
    mutate((tx, character, request) =>
      activateEcho(
        tx,
        playerActor(request, character.accountId),
        character,
        echoSchema.parse(request.body).echoId,
      ),
    ),
  );
  app.post(
    '/forge/decompose',
    mutate((tx, character, request) =>
      decomposeItem(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        itemSchema.parse(request.body).itemId,
      ),
    ),
  );
}
