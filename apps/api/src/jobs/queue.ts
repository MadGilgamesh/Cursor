/**
 * Kolejka zadań i scheduler (BullMQ na Redisie, GDD 9.3). Zadania cykliczne
 * rejestruje worker przy starcie (`registerSchedules`); API tylko dokłada zadania.
 */
import type { PushPayload } from '@game/shared';
import { lt } from 'drizzle-orm';
import { Queue, Worker, type Job } from 'bullmq';

import type { Clock } from '../clock.js';
import type { Executor } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { resolveDueActivities } from '../game/activities.js';
import { purgeExpiredIdempotencyKeys } from '../idempotency.js';
import type { PushSender } from '../push/sender.js';
import { activityCompletedPush, notifyAccount } from '../push/service.js';

export const JOBS_QUEUE = 'game-jobs';
const PREFIX = 'zb:bull';

export type JobData =
  | { type: 'system.heartbeat'; requestedAt: string }
  | { type: 'activities.sweep' }
  | { type: 'maintenance.daily' }
  | { type: 'push.notify'; accountId: string; payload: PushPayload };

export type JobType = JobData['type'];

export interface JobResult {
  type: JobType;
  processedAt: string;
  details: Record<string, number>;
}

export type JobsQueue = Queue<JobData, JobResult>;

const connection = (redisUrl: string) => ({ url: redisUrl, maxRetriesPerRequest: null });

export function createJobsQueue(redisUrl: string): JobsQueue {
  return new Queue<JobData, JobResult>(JOBS_QUEUE, {
    connection: connection(redisUrl),
    prefix: PREFIX,
    defaultJobOptions: {
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  });
}

/** Harmonogram z GDD 9.3, w zakresie systemów Etapu 0. */
export const SCHEDULES = [
  {
    id: 'activities-sweep',
    repeat: { every: 60_000 },
    data: { type: 'activities.sweep' },
  },
  {
    id: 'maintenance-daily',
    repeat: { pattern: '0 0 * * *', tz: 'UTC' },
    data: { type: 'maintenance.daily' },
  },
] as const satisfies readonly { id: string; repeat: object; data: JobData }[];

export async function registerSchedules(queue: JobsQueue): Promise<void> {
  for (const schedule of SCHEDULES) {
    await queue.upsertJobScheduler(schedule.id, schedule.repeat, {
      name: schedule.data.type,
      data: schedule.data,
    });
  }
}

export interface JobDeps {
  db: Executor;
  clock: Clock;
  queue: JobsQueue;
  /** `null`, gdy Web Push nie jest skonfigurowany (brak kluczy VAPID). */
  push: PushSender | null;
}

/** Rozstrzyga zakończone timery i kolejkuje powiadomienia (osobne zadania z ponawianiem). */
export async function runActivitiesSweep(
  deps: Pick<JobDeps, 'db' | 'clock' | 'queue'> & { pushEnabled: boolean },
): Promise<{ resolved: number; notifications: number }> {
  const resolved = await resolveDueActivities(deps);
  let notifications = 0;
  if (deps.pushEnabled) {
    for (const { activity, accountId } of resolved) {
      await deps.queue.add(
        'push.notify',
        { type: 'push.notify', accountId, payload: activityCompletedPush(activity) },
        { jobId: `push-activity-${activity.id}` },
      );
      notifications++;
    }
  }
  return { resolved: resolved.length, notifications };
}

export function createJobProcessor(deps: JobDeps) {
  return async (job: Pick<Job<JobData>, 'data'>): Promise<JobResult> => {
    const data = job.data;
    const done = (details: Record<string, number> = {}): JobResult => ({
      type: data.type,
      processedAt: deps.clock.now().toISOString(),
      details,
    });
    switch (data.type) {
      case 'system.heartbeat':
        return done();
      case 'activities.sweep':
        return done(await runActivitiesSweep({ ...deps, pushEnabled: deps.push !== null }));
      case 'maintenance.daily': {
        const now = deps.clock.now();
        const expiredSessions = await deps.db
          .delete(sessions)
          .where(lt(sessions.expiresAt, now))
          .returning({ id: sessions.id });
        const idempotencyKeys = await purgeExpiredIdempotencyKeys(deps.db, now);
        return done({ expiredSessions: expiredSessions.length, idempotencyKeys });
      }
      case 'push.notify': {
        if (!deps.push) return done({ skipped: 1 });
        return done(
          await notifyAccount(
            { db: deps.db, clock: deps.clock, sender: deps.push },
            data.accountId,
            data.payload,
          ),
        );
      }
    }
  };
}

export function createJobsWorker(redisUrl: string, deps: JobDeps): Worker<JobData, JobResult> {
  return new Worker<JobData, JobResult>(JOBS_QUEUE, createJobProcessor(deps), {
    connection: connection(redisUrl),
    prefix: PREFIX,
    concurrency: 8,
  });
}
