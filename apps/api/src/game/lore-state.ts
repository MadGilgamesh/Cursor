/**
 * Wiersz Wiedzy i Spraw. Mutacje tylko w transakcji, z blokadą wiersza.
 */
import {
  MIND_SCARS,
  RESIDENTS,
  SCAR_CHANCE_BP,
  bestiarySigilUnlock,
  createRng,
  rollMindScar,
  sanityPenaltyForScars,
} from '@game/shared';
import { eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import { loreStates, type LoreStateRow } from '../db/schema.js';

export const startingResidents = () =>
  RESIDENTS.map((resident) => ({ id: resident.id, familiarity: 0, gone: false }));

export async function insertLoreState(db: Executor, characterId: string): Promise<void> {
  await db.insert(loreStates).values({
    characterId,
    residents: startingResidents(),
  });
}

export async function loadLore(
  db: Executor,
  characterId: string,
  forUpdate = false,
): Promise<LoreStateRow> {
  const query = db
    .select()
    .from(loreStates)
    .where(eq(loreStates.characterId, characterId))
    .limit(1);
  const [row] = forUpdate ? await query.for('update') : await query;
  if (!row) throw new Error(`Postać ${characterId} nie ma stanu Wiedzy`);
  return row;
}

export async function saveLore(db: Executor, row: LoreStateRow): Promise<void> {
  await db
    .update(loreStates)
    .set({
      knowledge: row.knowledge,
      scars: row.scars,
      madnessUi: row.madnessUi,
      composure: row.composure,
      insight: row.insight,
      stealth: row.stealth,
      courseId: row.courseId,
      courseEndsAt: row.courseEndsAt,
      coursesDone: row.coursesDone,
      constellation: row.constellation,
      extinctOpen: row.extinctOpen,
      reputation: row.reputation,
      seals: row.seals,
      residents: row.residents,
      caseSeed: row.caseSeed,
      caseFound: row.caseFound,
      caseDeadline: row.caseDeadline,
      caseStatus: row.caseStatus,
      documentClueId: row.documentClueId,
      documentEndsAt: row.documentEndsAt,
      readingId: row.readingId,
      readingEndsAt: row.readingEndsAt,
      booksRead: row.booksRead,
      bestiary: row.bestiary,
      bestiarySigils: row.bestiarySigils,
      unrestUntil: row.unrestUntil,
    })
    .where(eq(loreStates.characterId, row.characterId));
}

export function loreExtras(row: LoreStateRow): { knowledge: number; sanityPenalty: number } {
  return { knowledge: row.knowledge, sanityPenalty: sanityPenaltyForScars(row.scars) };
}

/** Rzut na Bliznę przy Załamaniu (25%, maks. 3). */
export async function maybeMindScar(
  db: Executor,
  characterId: string,
  seed: string,
): Promise<void> {
  const row = await loadLore(db, characterId, true);
  const rng = createRng(seed);
  const hit = rng.rollBp(SCAR_CHANCE_BP);
  const picked = MIND_SCARS[rng.nextInt(0, MIND_SCARS.length - 1)];
  if (!picked) return;
  const scar = rollMindScar(hit, row.scars, picked.id);
  if (!scar) return;
  await saveLore(db, { ...row, scars: [...row.scars, scar] });
}

/** Zabicie typu z Domeny. Czwarta strona (1000) zwraca true raz. */
export async function recordPortalKill(
  db: Executor,
  characterId: string,
  domain: number,
  stage: number,
): Promise<boolean> {
  const row = await loadLore(db, characterId, true);
  const key = `${domain}:${stage}`;
  const before = row.bestiary[key] ?? 0;
  const after = before + 1;
  const grant = bestiarySigilUnlock(before, after) && !row.bestiarySigils.includes(key);
  await saveLore(db, {
    ...row,
    bestiary: { ...row.bestiary, [key]: after },
    bestiarySigils: grant ? [...row.bestiarySigils, key] : row.bestiarySigils,
  });
  return grant;
}
