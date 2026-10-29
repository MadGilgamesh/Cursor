import { CHAPEL_STATS, ERROR_CODES, FACTIONS, type FactionId } from '@game/shared';
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
import { deepenMission } from './activities.js';
import {
  buyAmbassadorGood,
  claimCourse,
  claimDocument,
  claimReading,
  deduceCase,
  loreOf,
  openCase,
  runErrand,
  setMadnessUi,
  startCourse,
  startReading,
  takeClue,
  trainChapel,
  unlockConstellation,
} from './lore.js';

const factionIds = FACTIONS.map((faction) => faction.id) as [string, ...string[]];
const chapelStats = CHAPEL_STATS;

async function characterOf(db: Executor, accountId: string): Promise<CharacterRow> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

/** Trasy Etapu 3. Mutacje wymagają Idempotency-Key. Odpowiedź Sprawy nie zawiera rozwiązania. */
export function loreRoutes(app: FastifyInstance, deps: AppDeps): void {
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

  app.get('/lore', async (request) =>
    loreOf(db, await characterOf(db, currentAccount(request).id), clock),
  );

  app.post(
    '/investigations/open',
    mutate((tx, character, request) =>
      openCase(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/investigations/clue',
    mutate((tx, character, request) =>
      takeClue(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ clueId: z.string().min(1).max(80) }).parse(request.body).clueId,
      ),
    ),
  );
  app.post(
    '/investigations/document',
    mutate((tx, character, request) =>
      claimDocument(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/investigations/deduce',
    mutate((tx, character, request) =>
      deduceCase(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z
          .object({
            who: z.int().min(0).max(5),
            where: z.int().min(0).max(5),
            intent: z.int().min(0).max(5),
          })
          .parse(request.body),
      ),
    ),
  );
  app.post(
    '/tomes/start',
    mutate((tx, character, request) =>
      startReading(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ tomeId: z.string().min(1).max(80) }).parse(request.body).tomeId,
      ),
    ),
  );
  app.post(
    '/tomes/claim',
    mutate((tx, character, request) =>
      claimReading(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/college/start',
    mutate((tx, character, request) =>
      startCourse(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ courseId: z.string().min(1).max(40) }).parse(request.body).courseId,
      ),
    ),
  );
  app.post(
    '/college/claim',
    mutate((tx, character, request) =>
      claimCourse(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/constellation/unlock',
    mutate((tx, character, request) =>
      unlockConstellation(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ nodeId: z.string().min(1).max(40) }).parse(request.body).nodeId,
      ),
    ),
  );
  app.post(
    '/chapel/train',
    mutate((tx, character, request) =>
      trainChapel(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ stat: z.enum(chapelStats) }).parse(request.body).stat,
      ),
    ),
  );
  app.post(
    '/factions/errand',
    mutate((tx, character, request) =>
      runErrand(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ faction: z.enum(factionIds) }).parse(request.body).faction as FactionId,
      ),
    ),
  );
  app.post(
    '/factions/buy',
    mutate((tx, character, request) =>
      buyAmbassadorGood(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ goodId: z.string().min(1).max(40) }).parse(request.body).goodId,
      ),
    ),
  );
  app.post(
    '/lore/madness',
    mutate((tx, character, request) =>
      setMadnessUi(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ enabled: z.boolean() }).parse(request.body).enabled,
      ),
    ),
  );
  app.post(
    '/missions/deepen',
    mutate((tx, character, request) =>
      deepenMission(
        { db: tx, clock },
        playerActor(request, character.accountId),
        character.id,
        z.object({ missionId: z.string().min(1).max(100) }).parse(request.body).missionId,
      ),
    ),
  );
}
