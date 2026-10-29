/** Osobny proces roboczy przetwarzający kolejkę timerów gry. */
import { loadConfig } from './config.js';
import { createTimersWorker } from './queues/timers.js';

const config = loadConfig();
const worker = createTimersWorker(config.redisUrl);

worker.on('ready', () => {
  console.log('Worker timerów gotowy.');
});
worker.on('failed', (job, error) => {
  console.error(`Zadanie ${job?.id ?? '?'} nieudane:`, error);
});

async function shutdown(): Promise<void> {
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
