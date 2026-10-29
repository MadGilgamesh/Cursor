import { ERROR_CODES } from '@game/shared';
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
  buyItem,
  claimDaily,
  deposit,
  equipItem,
  fightHunt,
  fightTutorial,
  huntBoard,
  listItems,
  profileOf,
  refreshHunt,
  train,
  unlockHall,
} from './stage1.js';

async function characterOf(db: Executor, accountId: string): Promise<CharacterRow> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

const fightSchema = z.object({ index: z.int().min(0).max(5) });
const trainSchema = z.object({
  stat: z.enum(['strength', 'defense', 'accuracy', 'evasion']),
  vigor: z.int().min(5).max(100).multipleOf(5),
});
const hallSchema = z.object({ hall: z.int().min(1).max(2) });
const itemSchema = z.object({ itemId: z.string().min(1).max(80) });
const amountSchema = z.object({ amount: z.int().positive().max(1_000_000_000) });

/** Trasy Etapu 1. Każda mutacja wymaga nagłówka Idempotency-Key. */
export function stage1Routes(app: FastifyInstance, deps: AppDeps): void {
  const { db, clock } = deps;
  app.addHook('preHandler', requireAuth(deps));

  const mutate = (
    statusCode: number,
    run: (tx: Executor, character: CharacterRow, request: FastifyRequest) => Promise<unknown>,
  ) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const account = currentAccount(request);
      return idempotent(db, request, reply, account.id, async (tx) => ({
        statusCode,
        body: await run(tx, await characterOf(tx, account.id), request),
      }));
    };
  };

  app.get('/profile', async (request) =>
    profileOf(db, await characterOf(db, currentAccount(request).id), clock),
  );
  app.get('/hunts', async (request) =>
    huntBoard(db, await characterOf(db, currentAccount(request).id), clock),
  );
  app.get('/inventory', async (request) => ({
    items: await listItems(db, (await characterOf(db, currentAccount(request).id)).id),
  }));

  app.post(
    '/tutorial',
    mutate(200, (tx, character, request) =>
      fightTutorial(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/hunts/refresh',
    mutate(200, (tx, character, request) =>
      refreshHunt(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
  app.post(
    '/hunts/fight',
    mutate(200, (tx, character, request) =>
      fightHunt(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        fightSchema.parse(request.body).index,
      ),
    ),
  );
  app.post(
    '/training',
    mutate(200, (tx, character, request) => {
      const body = trainSchema.parse(request.body);
      return train(
        tx,
        playerActor(request, character.accountId),
        character,
        clock,
        body.stat,
        body.vigor,
      );
    }),
  );
  app.post(
    '/training/unlock',
    mutate(200, (tx, character, request) =>
      unlockHall(
        tx,
        playerActor(request, character.accountId),
        character,
        hallSchema.parse(request.body).hall,
      ),
    ),
  );
  app.post(
    '/shop/buy',
    mutate(200, (tx, character, request) =>
      buyItem(
        tx,
        playerActor(request, character.accountId),
        character,
        itemSchema.parse(request.body).itemId,
      ),
    ),
  );
  app.post(
    '/inventory/equip',
    mutate(200, (tx, character, request) =>
      equipItem(tx, character, itemSchema.parse(request.body).itemId),
    ),
  );
  app.post(
    '/bank/deposit',
    mutate(200, (tx, character, request) =>
      deposit(
        tx,
        playerActor(request, character.accountId),
        character,
        amountSchema.parse(request.body).amount,
      ),
    ),
  );
  app.post(
    '/daily/claim',
    mutate(200, (tx, character, request) =>
      claimDaily(tx, playerActor(request, character.accountId), character, clock),
    ),
  );
}
