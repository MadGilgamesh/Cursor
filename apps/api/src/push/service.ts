import { findMission, type PushPayload, type PushSubscriptionInput } from '@game/shared';
import { and, eq } from 'drizzle-orm';

import type { Clock } from '../clock.js';
import type { Executor } from '../db/client.js';
import { pushSubscriptions, type TimedActivityRow } from '../db/schema.js';
import type { PushSender } from './sender.js';

export async function savePushSubscription(
  db: Executor,
  accountId: string,
  input: PushSubscriptionInput,
): Promise<void> {
  const values = {
    accountId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  };
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
}

export async function deletePushSubscription(
  db: Executor,
  accountId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.accountId, accountId), eq(pushSubscriptions.endpoint, endpoint)),
    );
}

/** Wysyła powiadomienie na wszystkie urządzenia gracza; martwe subskrypcje usuwa. */
export async function notifyAccount(
  { db, clock, sender }: { db: Executor; clock: Clock; sender: PushSender },
  accountId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number; failed: number }> {
  const targets = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.accountId, accountId));
  const stats = { sent: 0, removed: 0, failed: 0 };
  for (const target of targets) {
    const result = await sender.send(target, payload);
    if (result.ok) {
      stats.sent++;
      await db
        .update(pushSubscriptions)
        .set({ lastSuccessAt: clock.now() })
        .where(eq(pushSubscriptions.id, target.id));
    } else if (result.gone) {
      stats.removed++;
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id));
    } else {
      stats.failed++;
    }
  }
  return stats;
}

export function activityCompletedPush(activity: TimedActivityRow): PushPayload {
  const name = findMission(activity.defId)?.name ?? 'Zlecenie';
  return {
    title: 'Zlecenie zakończone',
    body: `${name}: nagroda czeka w Domu.`,
    url: '/',
    tag: `activity-${activity.id}`,
  };
}
