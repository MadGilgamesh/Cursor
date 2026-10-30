import { ERROR_CODES, MARKS } from '@game/shared';
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
import { descend, descentView } from './descent.js';

const marks = [...MARKS] as [string, ...string[]];

async function characterOf(db: Executor, accountId: string): Promise<CharacterRow> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

/** Trasy Etapu 10. Mutacja wymaga Idempotency-Key. */
export function descentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;
  app.addHook('preHandler', requireAuth(deps));

  app.get('/descent', async (request) => {
    const character = await characterOf(db, currentAccount(request).id);
    return descentView(character);
  });

  app.post('/descent', async (request: FastifyRequest, reply: FastifyReply) => {
    const account = currentAccount(request);
    const mark = z.object({ mark: z.enum(marks) }).parse(request.body).mark;
    return idempotent(db, request, reply, account.id, async (tx) => {
      const character = await characterOf(tx, account.id);
      return {
        statusCode: 200,
        body: await descend(tx, playerActor(request, character.accountId), character, mark),
      };
    });
  });
}
