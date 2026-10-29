/**
 * Sterowanie zegarem i schedulerem dla testów E2E. Rejestrowane wyłącznie przy
 * `ENABLE_TEST_CONTROLS=true` (konfiguracja odrzuca to na produkcji).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppDeps } from '../app.js';
import { OffsetClock } from '../clock.js';
import { runActivitiesSweep } from '../jobs/queue.js';

const advanceSchema = z.object({
  ms: z
    .int()
    .min(0)
    .max(30 * 24 * 60 * 60 * 1000),
});

export function testControlRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { clock } = deps;
  if (!(clock instanceof OffsetClock)) {
    throw new Error('Sterowanie testowe wymaga zegara OffsetClock');
  }

  app.post('/clock/advance', (request) => {
    clock.advance(advanceSchema.parse(request.body).ms);
    return { now: clock.now().toISOString() };
  });

  app.post('/jobs/activities-sweep', async () =>
    runActivitiesSweep({ ...deps, queue: deps.jobs, pushEnabled: deps.config.vapid !== null }),
  );
}
