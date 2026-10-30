import { CLOCK_PLAYER_ACTIONS, ERROR_CODES, type ClockAction } from '@game/shared';
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
  abyssBoard,
  acceptMarriage,
  applyLantern,
  bindReferral,
  buyCosmetic,
  buyEventGood,
  buyPatronSeal,
  checkout,
  claimDeadNight,
  claimPatronCandle,
  claimPatronVouchers,
  confirmPayment,
  contribute,
  lanternHall,
  openObservatory,
  payAbyss,
  proposeMarriage,
  redeemPatronSeal,
  referralView,
  relinquishLantern,
  renameCharacter,
  resolveLanterns,
  standLantern,
  verifyEmail,
} from './conjunction.js';

const clockActions = Object.keys(CLOCK_PLAYER_ACTIONS) as [ClockAction, ...ClockAction[]];

async function characterOf(db: Executor, accountId: string): Promise<CharacterRow> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

/** Trasy Etapu 9. Mutacje wymagają Idempotency-Key. */
export function conjunctionRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, clock, config } = deps;
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

  app.get('/conjunction', async (request) => {
    const character = await characterOf(db, currentAccount(request).id);
    return db.transaction((tx) =>
      openObservatory(tx, character, clock.now(), null, config.nodeEnv === 'test'),
    );
  });

  app.post(
    '/conjunction/start',
    mutate((tx, character, request) => {
      const pace = z.object({ pace: z.enum(['live', 'accelerated']) }).parse(request.body).pace;
      return openObservatory(tx, character, clock.now(), pace, config.nodeEnv === 'test');
    }),
  );

  app.post(
    '/conjunction/contribute',
    mutate((tx, character, request) =>
      contribute(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ action: z.enum(clockActions) }).parse(request.body).action,
        clock.now(),
      ),
    ),
  );

  app.get('/lanterns', async (request) => {
    await characterOf(db, currentAccount(request).id);
    return lanternHall(db, clock.now());
  });

  app.post(
    '/lanterns/resolve',
    mutate((tx, character, request) =>
      resolveLanterns(tx, playerActor(request, character.accountId), character, clock.now()),
    ),
  );

  app.post(
    '/lanterns/:sleeper/apply',
    mutate((tx, character, request) => {
      const sleeper = z.object({ sleeper: z.string().min(1) }).parse(request.params).sleeper;
      const defense = z.object({ defense: z.int().min(1).max(10_000) }).parse(request.body).defense;
      return applyLantern(
        tx,
        playerActor(request, character.accountId),
        character,
        sleeper,
        defense,
        clock.now(),
      );
    }),
  );

  app.post(
    '/lanterns/:sleeper/relinquish',
    mutate((tx, character, request) =>
      relinquishLantern(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ sleeper: z.string().min(1) }).parse(request.params).sleeper,
      ),
    ),
  );

  app.post(
    '/lanterns/:sleeper/stand',
    mutate((tx, character, request) =>
      standLantern(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ sleeper: z.string().min(1) }).parse(request.params).sleeper,
        clock.now(),
      ),
    ),
  );

  app.get('/well/abyss', async (request) => {
    const character = await characterOf(db, currentAccount(request).id);
    return abyssBoard(db, character.id);
  });

  app.post(
    '/well/abyss/payout',
    mutate((tx, character, request) =>
      payAbyss(tx, playerActor(request, character.accountId), character, clock.now()),
    ),
  );

  app.post(
    '/patron/seal',
    mutate((tx, character, request) =>
      buyPatronSeal(tx, playerActor(request, character.accountId), character),
    ),
  );

  app.post(
    '/patron/redeem',
    mutate((tx, character, request) =>
      redeemPatronSeal(tx, playerActor(request, character.accountId), character, clock.now()),
    ),
  );

  app.post(
    '/patron/candle',
    mutate((tx, character, request) =>
      claimPatronCandle(tx, playerActor(request, character.accountId), character, clock.now()),
    ),
  );

  app.post(
    '/patron/vouchers',
    mutate((tx, character, request) =>
      claimPatronVouchers(tx, playerActor(request, character.accountId), character, clock.now()),
    ),
  );

  app.post(
    '/payments/checkout',
    mutate((tx, character, request) =>
      checkout(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ sku: z.enum(['pearls-10', 'patron-30']) }).parse(request.body).sku,
      ),
    ),
  );

  app.post(
    '/payments/confirm',
    mutate((tx, character, request) => {
      const body = z
        .object({ receiptId: z.uuid(), signature: z.string().min(1) })
        .parse(request.body);
      return confirmPayment(
        tx,
        playerActor(request, character.accountId),
        character,
        body.receiptId,
        body.signature,
        clock.now(),
      );
    }),
  );

  app.post(
    '/account/verify',
    mutate((tx, character, request) =>
      verifyEmail(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ code: z.string().length(6) }).parse(request.body).code,
        clock.now(),
      ),
    ),
  );

  app.get('/referrals', async (request) => {
    const character = await characterOf(db, currentAccount(request).id);
    return db.transaction((tx) => referralView(tx, character));
  });

  app.post(
    '/referrals',
    mutate((tx, character, request) =>
      bindReferral(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ code: z.string().min(4).max(16) }).parse(request.body).code,
      ),
    ),
  );

  app.post(
    '/marriages',
    mutate((tx, character, request) => {
      const body = z
        .object({ partnerId: z.uuid(), rite: z.enum(['cathedral', 'blood']) })
        .parse(request.body);
      return proposeMarriage(
        tx,
        playerActor(request, character.accountId),
        character,
        body.partnerId,
        body.rite,
        clock.now(),
      );
    }),
  );

  app.post(
    '/marriages/:id/accept',
    mutate((tx, character, request) =>
      acceptMarriage(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ id: z.uuid() }).parse(request.params).id,
        clock.now(),
      ),
    ),
  );

  app.post(
    '/events/dead/claim',
    mutate((tx, character, request) =>
      claimDeadNight(tx, playerActor(request, character.accountId), character, clock.now()),
    ),
  );

  app.post(
    '/events/dead/buy',
    mutate((tx, character, request) => {
      const body = z
        .object({ sku: z.enum(['keys', 'frame']), paidWith: z.string().min(1) })
        .parse(request.body);
      return buyEventGood(
        tx,
        playerActor(request, character.accountId),
        character,
        body.sku,
        body.paidWith,
        clock.now(),
      );
    }),
  );

  app.post(
    '/cosmetics/buy',
    mutate((tx, character, request) =>
      buyCosmetic(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ id: z.string().min(1) }).parse(request.body).id,
      ),
    ),
  );

  app.post(
    '/character/rename',
    mutate((tx, character, request) =>
      renameCharacter(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ name: z.string().min(1) }).parse(request.body).name,
      ),
    ),
  );
}
