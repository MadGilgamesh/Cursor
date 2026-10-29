import { buildApp } from './app.js';
import { OffsetClock, systemClock } from './clock.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createJobsQueue } from './jobs/queue.js';
import { createRedis } from './redis.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);
const jobs = createJobsQueue(config.redisUrl);
const clock = config.enableTestControls ? new OffsetClock() : systemClock;
const app = await buildApp({ config, db: database.db, redis, clock, jobs });

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Zamykanie serwera…');
  try {
    await app.close();
    await jobs.close();
    await database.close();
    redis.disconnect();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'Błąd podczas zamykania');
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.fatal({ err: error }, 'Nie udało się uruchomić serwera');
  process.exit(1);
}
