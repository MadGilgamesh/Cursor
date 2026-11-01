/**
 * Nowe konto gracza: te same wiersze, które powstają przy rejestracji.
 * Seed paczki Dockera korzysta z tej samej ścieżki, żeby postać dało się otworzyć.
 */
import { CHARACTER_START_LEVEL } from '@game/shared';

import type { Executor } from '../db/client.js';
import { accounts, characters, type AccountRow, type CharacterRow } from '../db/schema.js';
import { insertStartingStats } from '../game/avatar.js';
import { issueReferralCode } from '../game/conjunction.js';
import { insertLoreState } from '../game/lore-state.js';
import { insertMarketState, insertWorkshopState } from '../game/port-state.js';
import { insertPortalState } from '../game/portal-state.js';
import { initialResources, insertResources, resourceContext } from '../game/resources.js';
import { insertWorldState } from '../game/world-state.js';

export async function provisionAccount(
  tx: Executor,
  now: Date,
  input: { email: string; passwordHash: string; characterName: string },
): Promise<{ account: AccountRow; character: CharacterRow }> {
  const issued = issueReferralCode();
  const [account] = await tx
    .insert(accounts)
    .values({
      email: input.email,
      passwordHash: input.passwordHash,
      referralCode: issued.code,
      emailVerifyCode: issued.verify,
    })
    .returning();
  if (!account) throw new Error('INSERT nie zwrócił konta');
  const [character] = await tx
    .insert(characters)
    .values({
      accountId: account.id,
      name: input.characterName,
      level: CHARACTER_START_LEVEL,
      experience: 0,
    })
    .returning();
  if (!character) throw new Error('INSERT nie zwrócił postaci');
  await insertResources(tx, character.id, initialResources(resourceContext(character.level), now));
  await insertStartingStats(tx, character.id);
  await insertPortalState(tx, character.id, now);
  await insertLoreState(tx, character.id);
  await insertWorldState(tx, character.id);
  await insertMarketState(tx, character.id);
  await insertWorkshopState(tx, character.id);
  return { account, character };
}
