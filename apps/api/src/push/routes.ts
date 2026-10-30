import {
  ERROR_CODES,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  type PushConfigResponse,
} from '@game/shared';
import type { FastifyInstance } from 'fastify';

import type { AppDeps } from '../app.js';
import { currentAccount, requireAuth } from '../auth/plugin.js';
import { AppError } from '../errors.js';
import { deletePushSubscription, savePushSubscription } from './service.js';

/** Szkielet Web Push (GDD 3.3): konfiguracja VAPID i subskrypcje urządzeń gracza. */
export function pushRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config } = deps;
  app.addHook('preHandler', requireAuth(deps));

  app.get('/push/config', (): PushConfigResponse => ({
    enabled: config.vapid !== null,
    publicKey: config.vapid?.publicKey ?? null,
  }));

  app.post('/push/subscriptions', async (request, reply) => {
    if (!config.vapid) {
      throw new AppError(
        503,
        ERROR_CODES.pushUnavailable,
        'Powiadomienia są wyłączone na serwerze',
      );
    }
    const account = currentAccount(request);
    await savePushSubscription(db, account.id, pushSubscriptionSchema.parse(request.body));
    return reply.status(201).send({ subscribed: true });
  });

  app.delete('/push/subscriptions', async (request, reply) => {
    const account = currentAccount(request);
    const { endpoint } = pushUnsubscribeSchema.parse(request.body);
    await deletePushSubscription(db, account.id, endpoint);
    return reply.status(204).send();
  });
}
