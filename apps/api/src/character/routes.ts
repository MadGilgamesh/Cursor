import type { SessionResponse } from '@game/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app.js';
import { currentAccount, requireAuth } from '../auth/plugin.js';
import { characters } from '../db/schema.js';
import { toSessionResponse } from '../serializers.js';

/** Trasy wymagające zalogowania: konto i jego postać. */
export function characterRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;
  app.addHook('preHandler', requireAuth(deps));

  app.get('/me', async (request): Promise<SessionResponse> => {
    const account = currentAccount(request);
    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.accountId, account.id))
      .limit(1);
    if (!character) throw new Error(`Konto ${account.id} nie ma postaci`);
    return toSessionResponse(account, character);
  });
}
