import { buildPanelApp } from './app.js';
import { systemClock } from './clock.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { ensureDatabase, ensurePanelSchema, runGameMigrations } from './migrate.js';
import { bootstrapStaff, seedBaseline } from './prepare.js';

const config = loadConfig();
if (config.nodeEnv !== 'production') await ensureDatabase(config.databaseUrl);
await runGameMigrations(config.databaseUrl);
const database = createDatabase(config.databaseUrl);
await ensurePanelSchema(database.db);
await seedBaseline(database.db);
let seededStaff: string | null = null;
if (config.bootstrap) {
  seededStaff = config.bootstrap.email;
  await bootstrapStaff(database.db, config.bootstrap);
  config.bootstrap = null;
  delete process.env.PANEL_STAFF_PASSWORD;
}

const app = await buildPanelApp({ config, db: database.db, clock: systemClock });

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Zamykanie Kancelarii…');
  try {
    await app.close();
    await database.close();
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
  app.log.info({ port: config.port, bootstrap: seededStaff }, 'Kancelaria nasłuchuje');
} catch (error) {
  app.log.fatal({ err: error }, 'Nie udało się uruchomić Kancelarii');
  process.exit(1);
}
