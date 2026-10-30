import { ERROR_CODES, ROOMS, SLEEPERS, type RoomId, type SleeperId } from '@game/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppDeps } from '../app.js';
import { currentAccount, requireAuth } from '../auth/plugin.js';
import type { Executor } from '../db/client.js';
import { characters, type CharacterRow } from '../db/schema.js';
import { AppError } from '../errors.js';
import { idempotent } from '../idempotency.js';
import {
  buyHouse,
  chooseMutation,
  cultOrder,
  drinkSalt,
  enterHideout,
  hearthOf,
  joinCult,
  resolveRitual,
  sellHouse,
  startRitual,
  swearOath,
  upgradeRoom,
  wearCursed,
} from './hearth.js';

const roomIds = [...ROOMS] as [RoomId, ...RoomId[]];
const sleeperIds = SLEEPERS.map((sleeper) => sleeper.id) as [SleeperId, ...SleeperId[]];

async function characterOf(db: Executor, accountId: string): Promise<CharacterRow> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

/** Trasy Etapu 7. Mutacje wymagają Idempotency-Key. */
export function hearthRoutes(app: FastifyInstance, deps: AppDeps): void {
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

  app.get('/hearth', async (request) => {
    const character = await characterOf(db, currentAccount(request).id);
    return db.transaction((tx) => hearthOf(tx, character, clock.now()));
  });

  app.post(
    '/hearth/house',
    mutate((tx, character, request) =>
      buyHouse(
        tx,
        character,
        clock.now(),
        z.object({ houseId: z.string() }).parse(request.body).houseId,
      ),
    ),
  );
  app.post(
    '/hearth/sell',
    mutate((tx, character) => sellHouse(tx, character, clock.now())),
  );
  app.post(
    '/hearth/rooms',
    mutate((tx, character, request) =>
      upgradeRoom(
        tx,
        character,
        clock.now(),
        z.object({ room: z.enum(roomIds) }).parse(request.body).room,
      ),
    ),
  );
  app.post(
    '/hearth/oath',
    mutate((tx, character, request) =>
      swearOath(
        tx,
        character,
        clock.now(),
        z.object({ sleeper: z.enum(sleeperIds) }).parse(request.body).sleeper,
      ),
    ),
  );
  app.post(
    '/hearth/cult',
    mutate((tx, character) => joinCult(tx, character, clock.now())),
  );
  app.post(
    '/hearth/cult/order',
    mutate((tx, character) => cultOrder(tx, character, clock.now())),
  );
  app.post(
    '/hearth/salt',
    mutate((tx, character) => drinkSalt(tx, character, clock.now())),
  );
  app.post(
    '/hearth/mutation',
    mutate((tx, character, request) =>
      chooseMutation(
        tx,
        character,
        clock.now(),
        z.object({ id: z.string().min(1).max(40) }).parse(request.body).id,
      ),
    ),
  );
  app.post(
    '/hearth/cursed',
    mutate((tx, character, request) =>
      wearCursed(
        tx,
        character,
        clock.now(),
        z.object({ worn: z.boolean() }).parse(request.body).worn,
      ),
    ),
  );
  app.post(
    '/hearth/rituals',
    mutate((tx, character, request) => {
      const body = z
        .object({ ritualId: z.string().min(1).max(80), domain: z.int().min(1).max(11).optional() })
        .parse(request.body);
      return startRitual(tx, character, clock.now(), body.ritualId, body.domain ?? 1);
    }),
  );
  app.post(
    '/hearth/rituals/resolve',
    mutate((tx, character) => resolveRitual(tx, character, clock.now())),
  );
  app.post(
    '/hearth/hideout',
    mutate((tx, character) => enterHideout(tx, character, clock.now())),
  );
}
