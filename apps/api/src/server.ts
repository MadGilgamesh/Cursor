import { buildApp } from './app.js';
import { systemClock } from './clock.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createRedis } from './redis.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);
const app = await buildApp({ config, db: database.db, redis, clock: systemClock });

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Zamykanie serwera…');
  try {
    await app.close();
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
