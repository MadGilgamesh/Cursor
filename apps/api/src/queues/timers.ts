/**
 * Kolejka timerów gry (BullMQ na Redisie) — SZKIELET.
 *
 * Tu trafią zadania odroczone i cykliczne: zakończenie wyprawy, naliczanie
 * nagród bezczynności (idle), reset dzienny, odnowienie energii itd.
 * Każde zadanie jest rozstrzygane przez serwer; klient tylko odczytuje wynik.
 */
import { Queue, Worker, type Job } from 'bullmq';

export const TIMERS_QUEUE = 'game-timers';

interface HeartbeatJob {
  type: 'system.heartbeat';
  requestedAt: string;
}

/** Unia wszystkich typów zadań; każdy nowy typ wymaga wpisu w `handlers`. */
export type TimerJob = HeartbeatJob;

export interface TimerJobResult {
  type: TimerJob['type'];
  processedAt: string;
}

const handlers: {
  [K in TimerJob['type']]: (data: Extract<TimerJob, { type: K }>) => TimerJobResult;
} = {
  'system.heartbeat': (data) => ({ type: data.type, processedAt: new Date().toISOString() }),
};

const connection = (redisUrl: string) => ({ url: redisUrl, maxRetriesPerRequest: null });

export function createTimersQueue(redisUrl: string): Queue<TimerJob, TimerJobResult> {
  return new Queue<TimerJob, TimerJobResult>(TIMERS_QUEUE, {
    connection: connection(redisUrl),
    prefix: 'mg:bull',
    defaultJobOptions: { removeOnComplete: 1_000, removeOnFail: 5_000, attempts: 3 },
  });
}

export function processTimerJob(job: Pick<Job<TimerJob>, 'data'>): TimerJobResult {
  return handlers[job.data.type](job.data);
}

export function createTimersWorker(redisUrl: string): Worker<TimerJob, TimerJobResult> {
  const processor = (job: Job<TimerJob>) => Promise.resolve(processTimerJob(job));
  return new Worker<TimerJob, TimerJobResult>(TIMERS_QUEUE, processor, {
    connection: connection(redisUrl),
    prefix: 'mg:bull',
    concurrency: 8,
  });
}
