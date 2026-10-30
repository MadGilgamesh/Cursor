import { CITIES, ERROR_CODES, MOUNT_IDS, type CityId, type MountId } from '@game/shared';
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
  brandItem,
  buySeed,
  castLine,
  claimClinic,
  clearPlot,
  depart,
  harvestCrop,
  meetResident,
  plantCrop,
  purify,
  reelLine,
  rentMount,
  sealItem,
  startClinic,
  waterCrop,
  worldOf,
} from './world.js';

const cities = [...CITIES] as [CityId, ...CityId[]];
const mounts = [...MOUNT_IDS] as [MountId, ...MountId[]];

async function characterOf(db: Executor, accountId: string): Promise<CharacterRow> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

/** Trasy Etapu 4. Mutacje wymagają Idempotency-Key. */
export function worldRoutes(app: FastifyInstance, deps: AppDeps): void {
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

  app.get('/world', async (request) =>
    worldOf(db, await characterOf(db, currentAccount(request).id), clock),
  );

  app.post(
    '/travel',
    mutate((tx, character, request) =>
      depart(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ city: z.enum(cities) }).parse(request.body).city,
      ),
    ),
  );
  app.post(
    '/mounts/rent',
    mutate((tx, character, request) => {
      const body = z
        .object({ mountId: z.enum(mounts), days: z.int().min(1).max(7) })
        .parse(request.body);
      return rentMount(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        body.mountId,
        body.days,
      );
    }),
  );
  app.post(
    '/garden/plant',
    mutate((tx, character, request) => {
      const body = z
        .object({ plot: z.int().min(0).max(3), cropId: z.string().min(1).max(40) })
        .parse(request.body);
      return plantCrop(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        body.plot,
        body.cropId,
      );
    }),
  );
  app.post(
    '/garden/water',
    mutate((tx, character, request) =>
      waterCrop(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ plot: z.int().min(0).max(3) }).parse(request.body).plot,
      ),
    ),
  );
  app.post(
    '/garden/harvest',
    mutate((tx, character, request) =>
      harvestCrop(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ plot: z.int().min(0).max(3) }).parse(request.body).plot,
      ),
    ),
  );
  app.post(
    '/garden/clear',
    mutate((tx, character, request) =>
      clearPlot(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ plot: z.int().min(0).max(3) }).parse(request.body).plot,
      ),
    ),
  );
  app.post(
    '/fishing/cast',
    mutate((tx, character, request) =>
      castLine(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/fishing/reel',
    mutate((tx, character, request) =>
      reelLine(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z
          .object({
            reactionOffsetMs: z.int().min(0).max(60_000),
            tensions: z.array(z.int().min(0).max(100)).max(12),
          })
          .parse(request.body),
      ),
    ),
  );
  app.post(
    '/forge/brand',
    mutate((tx, character, request) => {
      const body = z
        .object({ itemId: z.uuid(), materialId: z.string().min(1).max(40) })
        .parse(request.body);
      return brandItem(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        body.itemId,
        body.materialId,
      );
    }),
  );
  app.post(
    '/services/seal',
    mutate((tx, character, request) =>
      sealItem(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ itemId: z.uuid() }).parse(request.body).itemId,
      ),
    ),
  );
  app.post(
    '/services/purify',
    mutate((tx, character, request) =>
      purify(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/services/clinic',
    mutate((tx, character, request) =>
      startClinic(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/services/clinic/claim',
    mutate((tx, character, request) =>
      claimClinic(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/residents/meet',
    mutate((tx, character, request) =>
      meetResident(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ residentId: z.string().min(1).max(40) }).parse(request.body).residentId,
      ),
    ),
  );
  app.post(
    '/herbalist/buy',
    mutate((tx, character, request) =>
      buySeed(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        z.object({ cropId: z.string().min(1).max(40) }).parse(request.body).cropId,
      ),
    ),
  );
}
