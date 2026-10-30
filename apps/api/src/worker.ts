/** Osobny proces roboczy: harmonogram (GDD 9.3), rozstrzyganie timerów i Web Push. */
import { systemClock } from './clock.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createJobsQueue, createJobsWorker, registerSchedules } from './jobs/queue.js';
import { createWebPushSender } from './push/sender.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl, { max: 5 });
const queue = createJobsQueue(config.redisUrl);
const push = config.vapid ? createWebPushSender(config.vapid) : null;

await registerSchedules(queue);
const worker = createJobsWorker(config.redisUrl, {
  db: database.db,
  clock: systemClock,
  queue,
  push,
});

worker.on('ready', () => {
  console.log(`Worker gotowy (Web Push: ${push ? 'włączony' : 'wyłączony'}).`);
});
worker.on('failed', (job, error) => {
  console.error(`Zadanie ${job?.name ?? '?'} (${job?.id ?? '?'}) nieudane:`, error);
});

async function shutdown(): Promise<void> {
  await worker.close();
  await queue.close();
  await database.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
