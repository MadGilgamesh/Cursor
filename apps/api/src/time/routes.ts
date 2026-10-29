import type { ServerTimeResponse } from '@game/shared';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app.js';

/** Czas serwera dla klienta — do liczenia odliczań timerów bez ufania zegarowi urządzenia. */
export function timeRoutes(app: FastifyInstance, { clock }: AppDeps): void {
  app.get('/time', (): ServerTimeResponse => {
    const now = clock.now();
    return { now: now.toISOString(), epochMs: now.getTime() };
  });
}
