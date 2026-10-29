import { ERROR_CODES, WORKSHOP_STATIONS, type WorkshopStation } from '@game/shared';
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
  acceptTrade,
  addFriend,
  bidAuction,
  blockChatter,
  claimCandle,
  claimMail,
  eatRation,
  filletFish,
  listAuction,
  marketView,
  offerTrade,
  packCrate,
  placeOrder,
  portOf,
  postChat,
  readChat,
  reportChat,
  sellCrate,
  sendMail,
  startJob,
  upgradeWorkshop,
} from './port.js';

const stations = [...WORKSHOP_STATIONS] as [WorkshopStation, ...WorkshopStation[]];

async function characterOf(db: Executor, accountId: string): Promise<CharacterRow> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

/** Trasy Etapu 5. Mutacje wymagają Idempotency-Key. */
export function portRoutes(app: FastifyInstance, deps: AppDeps): void {
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

  app.get('/port', async (request) =>
    portOf(db, await characterOf(db, currentAccount(request).id), clock),
  );
  app.get('/market', async (request) => {
    const goodId = z.object({ good: z.string().min(3).max(80) }).parse(request.query).good;
    return marketView(db, goodId, clock);
  });
  app.get('/chat/:channel', async (request) => {
    const channel = z.object({ channel: z.string() }).parse(request.params).channel;
    return readChat(db, await characterOf(db, currentAccount(request).id), channel);
  });

  app.post(
    '/market/orders',
    mutate((tx, character, request) => {
      const body = z
        .object({
          goodId: z.string().min(3).max(80),
          side: z.enum(['buy', 'sell']),
          type: z.enum(['limit', 'market']),
          price: z.int().min(1).max(1_000_000).nullable(),
          quantity: z.int().min(1).max(10_000),
        })
        .parse(request.body);
      return placeOrder(tx, playerActor(request, character.accountId), character, clock, body);
    }),
  );
  app.post(
    '/auctions',
    mutate((tx, character, request) => {
      const body = z
        .object({
          itemId: z.uuid(),
          minBid: z.int().min(1),
          buyNow: z.int().min(1).nullable(),
        })
        .parse(request.body);
      return listAuction(
        tx,
        playerActor(request, character.accountId),
        character,
        body.itemId,
        body.minBid,
        body.buyNow,
      );
    }),
  );
  app.post(
    '/auctions/:id/bid',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const body = z
        .object({ amount: z.int().min(1), buyNow: z.boolean().default(false) })
        .parse(request.body);
      return bidAuction(
        tx,
        playerActor(request, character.accountId),
        character,
        id,
        body.amount,
        body.buyNow,
      );
    }),
  );
  app.post(
    '/trades',
    mutate((tx, character, request) => {
      const body = z
        .object({ takerId: z.uuid(), itemId: z.uuid(), silver: z.int().min(0).max(1_000_000) })
        .parse(request.body);
      return offerTrade(
        tx,
        playerActor(request, character.accountId),
        character,
        body.takerId,
        body.itemId,
        body.silver,
      );
    }),
  );
  app.post(
    '/trades/:id/accept',
    mutate((tx, character, request) =>
      acceptTrade(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ id: z.uuid() }).parse(request.params).id,
      ),
    ),
  );
  app.post(
    '/mail',
    mutate((tx, character, request) => {
      const body = z
        .object({
          toId: z.uuid(),
          body: z.string().min(1).max(280),
          silver: z.int().min(0).max(1_000_000).default(0),
          goodId: z.string().min(3).max(80).nullable().default(null),
          goodQty: z.int().min(0).max(100).default(0),
        })
        .parse(request.body);
      return sendMail(
        tx,
        playerActor(request, character.accountId),
        character,
        body.toId,
        body.body,
        body.silver,
        body.goodId,
        body.goodQty,
      );
    }),
  );
  app.post(
    '/mail/:id/claim',
    mutate((tx, character, request) =>
      claimMail(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ id: z.uuid() }).parse(request.params).id,
      ),
    ),
  );
  app.post(
    '/workshops/upgrade',
    mutate((tx, character, request) =>
      upgradeWorkshop(
        tx,
        playerActor(request, character.accountId),
        character,
        z.object({ station: z.enum(stations) }).parse(request.body).station,
      ),
    ),
  );
  app.post(
    '/workshops/candle',
    mutate((tx, character, request) =>
      claimCandle(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/workshops/jobs',
    mutate((tx, character, request) => {
      const body = z
        .object({
          station: z.enum(stations),
          tomeId: z.string().min(1).max(40).nullable().default(null),
        })
        .parse(request.body);
      return startJob(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        body.station,
        body.tomeId,
      );
    }),
  );
  app.post(
    '/kitchen/fillet',
    mutate((tx, character) => filletFish(tx, character)),
  );
  app.post(
    '/kitchen/eat',
    mutate((tx, character, request) =>
      eatRation(tx, character, clock, z.object({ goodId: z.string() }).parse(request.body).goodId),
    ),
  );
  app.post(
    '/smuggle/pack',
    mutate((tx, character, request) => {
      const body = z
        .object({ goodId: z.string(), qty: z.int().min(1).max(20) })
        .parse(request.body);
      return packCrate(tx, character, body.goodId, body.qty);
    }),
  );
  app.post(
    '/smuggle/sell',
    mutate((tx, character, request) =>
      sellCrate(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/chat',
    mutate((tx, character, request) => {
      const body = z
        .object({ channel: z.enum(['general', 'trade', 'help']), body: z.string().min(1).max(200) })
        .parse(request.body);
      return postChat(
        tx,
        playerActor(request, character.accountId),
        character,
        body.channel,
        body.body,
      );
    }),
  );
  app.post(
    '/chat/report',
    mutate((tx, character, request) =>
      reportChat(tx, character, z.object({ messageId: z.uuid() }).parse(request.body).messageId),
    ),
  );
  app.post(
    '/chat/block',
    mutate((tx, character, request) =>
      blockChatter(tx, character, z.object({ blockedId: z.uuid() }).parse(request.body).blockedId),
    ),
  );
  app.post(
    '/friends',
    mutate((tx, character, request) =>
      addFriend(tx, character, z.object({ friendId: z.uuid() }).parse(request.body).friendId),
    ),
  );
}
