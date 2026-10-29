/**
 * Wiersze giełdy i warsztatów. Mutacje idą w transakcji.
 */
import type { Executor } from '../db/client.js';
import { marketStates, workshopStates } from '../db/schema.js';

export async function insertMarketState(db: Executor, characterId: string): Promise<void> {
  await db.insert(marketStates).values({ characterId });
}

export async function insertWorkshopState(db: Executor, characterId: string): Promise<void> {
  await db.insert(workshopStates).values({ characterId });
}
