/**
 * Zstąpienie (GDD 6.6). Poziom wraca do 1, sprzęt, dom, wiedza i Portal zostają.
 * Klasy powyżej 0 schodzą do 1 z zerowym XP klasy. Klasa 0 zostaje 0.
 */
import { DESCENT_MAX, DESCENT_MIN_LEVEL, ERROR_CODES, MARKS, type Mark } from '@game/shared';
import { and, eq, gt } from 'drizzle-orm';

import { writeAudit, type AuditActor } from '../audit.js';
import type { Executor } from '../db/client.js';
import { characters, classProgress, type CharacterRow } from '../db/schema.js';
import { AppError } from '../errors.js';
import { lockCharacter } from './activities.js';

function isMark(value: string): value is Mark {
  return (MARKS as readonly string[]).includes(value);
}

export function descentView(row: CharacterRow) {
  const title = [...row.titles].reverse().find((item) => item.startsWith('Piętno ')) ?? null;
  return {
    level: row.level,
    descentCount: row.descentCount,
    max: DESCENT_MAX,
    minLevel: DESCENT_MIN_LEVEL,
    markTraining: row.markTraining,
    markMutation: row.markMutation,
    markConstellation: row.markConstellation,
    essence: row.essence,
    essenceXp: row.essenceXp,
    title,
  };
}

export async function descend(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  mark: string,
) {
  if (!isMark(mark)) throw new AppError(400, ERROR_CODES.validation, 'Nieznane Piętno');
  const locked = await lockCharacter(db, character.id);
  if (locked.level < DESCENT_MIN_LEVEL) {
    throw new AppError(409, ERROR_CODES.requirement, 'Zstąpienie otwiera się od poziomu 60');
  }
  if (locked.descentCount >= DESCENT_MAX) {
    throw new AppError(409, ERROR_CODES.requirement, 'Drzewo Piętn jest pełne');
  }
  const next = locked.descentCount + 1;
  const title = `Piętno ${next}`;
  const titles = locked.titles.includes(title) ? locked.titles : [...locked.titles, title];
  const [updated] = await db
    .update(characters)
    .set({
      level: 1,
      experience: 0,
      descentCount: next,
      markTraining: locked.markTraining + (mark === 'training' ? 1 : 0),
      markMutation: locked.markMutation + (mark === 'mutation' ? 1 : 0),
      markConstellation: locked.markConstellation + (mark === 'constellation' ? 1 : 0),
      titles,
    })
    .where(eq(characters.id, locked.id))
    .returning();
  if (!updated) throw new Error('UPDATE nie zwrócił postaci');
  await db
    .update(classProgress)
    .set({ level: 1, experience: 0 })
    .where(and(eq(classProgress.characterId, locked.id), gt(classProgress.level, 0)));
  await writeAudit(db, who, {
    action: 'descent',
    characterId: locked.id,
    after: { count: next, mark },
  });
  return descentView(updated);
}
