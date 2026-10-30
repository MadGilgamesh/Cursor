/**
 * Zapis poziomu, XP i Esencji. Nadmiar na poziomie 80 składa się w Esencję
 * (1 punkt za każdy pełny milion). Nie woła aktywności — tamte wołają tutaj.
 */
import { bankEssence, grantExperience } from '@game/shared';
import { eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import { characters, type CharacterRow } from '../db/schema.js';

type ProgressRow = Pick<CharacterRow, 'id' | 'level' | 'experience' | 'essence' | 'essenceXp'>;

export async function persistProgress(
  db: Executor,
  character: ProgressRow,
  amount: number,
): Promise<CharacterRow> {
  const progress = grantExperience(character, amount);
  const banked = bankEssence(character.essenceXp, progress.overflow);
  const [updated] = await db
    .update(characters)
    .set({
      level: progress.level,
      experience: progress.experience,
      essence: character.essence + banked.essence,
      essenceXp: banked.essenceXp,
    })
    .where(eq(characters.id, character.id))
    .returning();
  if (!updated) throw new Error('UPDATE nie zwrócił postaci');
  return updated;
}
