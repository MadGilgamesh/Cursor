/**
 * Wyprawy 1–6 i eskorty (GDD 5.11, 5.23).
 * Snapshot klasy powstaje przy starcie. Rozliczenie czyta tylko ten zapis.
 */
import { randomBytes } from 'node:crypto';

import {
  ASSIST_ORDER_REPUTATION,
  CLASS_IDS,
  ERROR_CODES,
  ESCORT_GUARD_SEAL,
  EXPEDITIONS,
  PERSONAL_SEALS,
  PERSONAL_SHARDS,
  computeLoadout,
  createRng,
  entrySilver,
  escortSanityLoss,
  expeditionDurationMs,
  expeditionKnowledge,
  expeditionOpen,
  expeditionWeek,
  findExpedition,
  halvedByEscort,
  resolveExpedition,
  resourceMax,
  shareExperience,
  type ClassId,
  type ExpeditionId,
} from '@game/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { writeAudit, type AuditActor } from '../audit.js';
import type { Executor } from '../db/client.js';
import {
  characters,
  escorts,
  loreStates,
  expeditionEntries,
  expeditionMembers,
  expeditions,
  type CharacterRow,
  type EscortRow,
} from '../db/schema.js';
import { AppError } from '../errors.js';
import { lockCharacter } from './activities.js';
import { persistProgress } from './progress.js';
import { equippedOf } from './avatar.js';
import { loadLore, loreExtras, saveLore } from './lore-state.js';
import { grantKeyShards } from './portal-state.js';
import { loadResources, materializeAll, resourceContext } from './resources.js';
import { InsufficientFundsError, postLedgerEntry } from './wallet.js';
import { loadWorld } from './world-state.js';

const OPEN_RUN = ['lobby', 'running'] as const;
const OPEN_ESCORT = ['offered', 'active'] as const;

async function knowledgeOf(db: Executor, characterId: string) {
  const [row] = await db
    .select({ knowledge: loreStates.knowledge })
    .from(loreStates)
    .where(eq(loreStates.characterId, characterId))
    .limit(1);
  return row?.knowledge ?? 0;
}

async function assertKnowledge(db: Executor, characterId: string, defId: ExpeditionId) {
  const need = expeditionKnowledge(defId);
  if (need > 0 && (await knowledgeOf(db, characterId)) < need) forbid('Za mało Wiedzy');
}

function forbid(message: string): never {
  throw new AppError(409, ERROR_CODES.requirement, message);
}

function asClass(value: string | null): ClassId | null {
  if (value && (CLASS_IDS as readonly string[]).includes(value)) return value as ClassId;
  return null;
}

async function busyRun(db: Executor, characterId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: expeditions.id })
    .from(expeditionMembers)
    .innerJoin(expeditions, eq(expeditions.id, expeditionMembers.expeditionId))
    .where(
      and(
        eq(expeditionMembers.characterId, characterId),
        inArray(expeditions.status, [...OPEN_RUN]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function lockRun(db: Executor, id: string) {
  const [row] = await db
    .select()
    .from(expeditions)
    .where(eq(expeditions.id, id))
    .limit(1)
    .for('update');
  if (!row) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej wyprawy');
  return row;
}

async function memberRows(db: Executor, expeditionId: string) {
  return db
    .select({
      characterId: expeditionMembers.characterId,
      name: characters.name,
      assist: expeditionMembers.assist,
      ready: expeditionMembers.ready,
      classId: expeditionMembers.classId,
      share: expeditionMembers.share,
      sanity: expeditionMembers.sanity,
      maxSanity: expeditionMembers.maxSanity,
      level: expeditionMembers.level,
    })
    .from(expeditionMembers)
    .innerJoin(characters, eq(characters.id, expeditionMembers.characterId))
    .where(eq(expeditionMembers.expeditionId, expeditionId));
}

function viewOf(
  row: typeof expeditions.$inferSelect,
  members: Awaited<ReturnType<typeof memberRows>>,
) {
  const def = findExpedition(row.defId);
  return {
    id: row.id,
    defId: row.defId,
    name: def?.name ?? row.defId,
    status: row.status,
    endsAt: row.endsAt?.toISOString() ?? null,
    loot: row.pool,
    shared: row.sharedSanity,
    missed: row.missed,
    betrayerId: row.betrayerId,
    log: row.log,
    members: members.map((member) => ({
      characterId: member.characterId,
      name: member.name,
      assist: member.assist,
      ready: member.ready,
      classId: member.classId,
      share: member.share,
    })),
  };
}

async function runView(db: Executor, id: string) {
  const [row] = await db.select().from(expeditions).where(eq(expeditions.id, id)).limit(1);
  if (!row) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej wyprawy');
  return viewOf(row, await memberRows(db, id));
}

export async function expeditionHall(db: Executor, character: CharacterRow, now: Date) {
  const week = expeditionWeek(now.getTime());
  const entries = await db
    .select()
    .from(expeditionEntries)
    .where(
      and(eq(expeditionEntries.characterId, character.id), eq(expeditionEntries.weekKey, week)),
    );
  const usedOf = new Map(entries.map((entry) => [entry.defId, entry.used]));
  const [mine] = await db
    .select({ id: expeditions.id })
    .from(expeditionMembers)
    .innerJoin(expeditions, eq(expeditions.id, expeditionMembers.expeditionId))
    .where(
      and(
        eq(expeditionMembers.characterId, character.id),
        inArray(expeditions.status, ['lobby', 'running', 'resolved']),
      ),
    )
    .orderBy(desc(expeditions.createdAt))
    .limit(1);
  return {
    catalog: EXPEDITIONS.map((def) => {
      const used = usedOf.get(def.id) ?? 0;
      return {
        id: def.id,
        name: def.name,
        level: def.level,
        party: def.party,
        hours: def.hours,
        window: def.window,
        weekly: def.weekly,
        open: expeditionOpen(def.window, now.getTime()),
        used,
        remaining: Math.max(0, def.weekly - used),
      };
    }),
    mine: mine ? await runView(db, mine.id) : null,
  };
}

export async function createExpedition(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  now: Date,
  defId: ExpeditionId,
) {
  const def = findExpedition(defId);
  if (!def) forbid('Nieznana wyprawa');
  const locked = await lockCharacter(db, character.id);
  if (locked.level < def.level) forbid('Za niski poziom');
  await assertKnowledge(db, locked.id, def.id);
  if (await busyRun(db, locked.id)) forbid('Jesteś już w wyprawie');
  const [row] = await db
    .insert(expeditions)
    .values({
      leaderId: locked.id,
      defId: def.id,
      status: 'lobby',
      weekKey: expeditionWeek(now.getTime()),
    })
    .returning();
  if (!row) throw new Error('Nie udało się otworzyć lobby');
  await db.insert(expeditionMembers).values({
    expeditionId: row.id,
    characterId: locked.id,
    assist: false,
    ready: false,
  });
  await writeAudit(db, who, {
    action: 'expedition.create',
    characterId: locked.id,
    after: { id: row.id },
  });
  return runView(db, row.id);
}

export async function joinExpedition(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  expeditionId: string,
  assist: boolean,
) {
  const run = await lockRun(db, expeditionId);
  if (run.status !== 'lobby') forbid('Wyprawa już ruszyła');
  const def = findExpedition(run.defId);
  if (!def) forbid('Nieznana wyprawa');
  const locked = await lockCharacter(db, character.id);
  if (locked.level < def.level) forbid('Za niski poziom');
  if (!assist) await assertKnowledge(db, locked.id, def.id);
  if (await busyRun(db, locked.id)) forbid('Jesteś już w wyprawie');
  const members = await memberRows(db, run.id);
  if (members.length >= def.party) forbid('Drużyna jest pełna');
  const week = run.weekKey;
  const [entry] = await db
    .select()
    .from(expeditionEntries)
    .where(
      and(
        eq(expeditionEntries.characterId, locked.id),
        eq(expeditionEntries.defId, def.id),
        eq(expeditionEntries.weekKey, week),
      ),
    )
    .limit(1);
  const used = entry?.used ?? 0;
  if (assist && used < def.weekly) forbid('Najpierw zużyj własne wejścia');
  if (!assist && used >= def.weekly) forbid('Wejścia na ten tydzień się skończyły');
  await db.insert(expeditionMembers).values({
    expeditionId: run.id,
    characterId: locked.id,
    assist,
    ready: false,
  });
  await writeAudit(db, who, {
    action: 'expedition.join',
    characterId: locked.id,
    after: { id: run.id, assist },
  });
  return runView(db, run.id);
}

export async function readyExpedition(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  expeditionId: string,
) {
  const run = await lockRun(db, expeditionId);
  if (run.status !== 'lobby') forbid('Wyprawa już ruszyła');
  const members = await memberRows(db, run.id);
  if (!members.some((member) => member.characterId === character.id)) {
    forbid('Nie ma cię w tej drużynie');
  }
  await db
    .update(expeditionMembers)
    .set({ ready: true })
    .where(
      and(
        eq(expeditionMembers.expeditionId, run.id),
        eq(expeditionMembers.characterId, character.id),
      ),
    );
  await writeAudit(db, who, {
    action: 'expedition.ready',
    characterId: character.id,
    after: { id: run.id },
  });
  return runView(db, run.id);
}

async function entriesUsed(db: Executor, characterId: string, defId: string, week: string) {
  const [entry] = await db
    .select()
    .from(expeditionEntries)
    .where(
      and(
        eq(expeditionEntries.characterId, characterId),
        eq(expeditionEntries.defId, defId),
        eq(expeditionEntries.weekKey, week),
      ),
    )
    .limit(1)
    .for('update');
  return entry?.used ?? 0;
}

async function bumpEntry(
  db: Executor,
  characterId: string,
  defId: string,
  week: string,
  used: number,
) {
  if (used === 0) {
    await db.insert(expeditionEntries).values({ characterId, defId, weekKey: week, used: 1 });
    return;
  }
  await db
    .update(expeditionEntries)
    .set({ used: used + 1 })
    .where(
      and(
        eq(expeditionEntries.characterId, characterId),
        eq(expeditionEntries.defId, defId),
        eq(expeditionEntries.weekKey, week),
      ),
    );
}

export async function startExpedition(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  now: Date,
  expeditionId: string,
) {
  const run = await lockRun(db, expeditionId);
  if (run.leaderId !== character.id) forbid('Tylko lider otwiera zejście');
  if (run.status !== 'lobby') forbid('Wyprawa już ruszyła');
  const def = findExpedition(run.defId);
  if (!def) forbid('Nieznana wyprawa');
  if (!expeditionOpen(def.window, now.getTime())) forbid('Okno wyprawy jest zamknięte');
  const members = await memberRows(db, run.id);
  if (members.length !== def.party) forbid('Drużyna nie jest w komplecie');
  if (members.some((member) => !member.ready)) forbid('Ktoś jeszcze nie jest gotowy');
  const ids = [...members.map((member) => member.characterId)].sort();
  const locked = new Map<string, CharacterRow>();
  for (const id of ids) locked.set(id, await lockCharacter(db, id));
  for (const member of members) {
    const row = locked.get(member.characterId);
    if (!row || row.level < def.level) forbid('Ktoś w drużynie ma za niski poziom');
    if (member.assist) continue;
    await assertKnowledge(db, member.characterId, def.id);
    const used = await entriesUsed(db, member.characterId, def.id, run.weekKey);
    if (used >= def.weekly) forbid('Wejścia na ten tydzień się skończyły');
  }
  for (const member of members) {
    if (member.assist) continue;
    const row = locked.get(member.characterId);
    if (!row) forbid('Brak postaci');
    try {
      await postLedgerEntry(db, {
        characterId: row.id,
        currency: 'silver',
        delta: -entrySilver(row.level),
        reason: 'expedition.entry',
        refId: run.id,
        idempotencyKey: `expedition:${run.id}:entry:${row.id}`,
      });
    } catch (error) {
      if (error instanceof InsufficientFundsError) forbid('Za mało srebra na wejście');
      throw error;
    }
    const used = await entriesUsed(db, row.id, def.id, run.weekKey);
    await bumpEntry(db, row.id, def.id, run.weekKey, used);
  }
  for (const member of members) {
    const row = locked.get(member.characterId);
    if (!row) forbid('Brak postaci');
    const lore = await loadLore(db, row.id);
    const extras = loreExtras(lore);
    const ctx = resourceContext(row.level, extras.knowledge, extras.sanityPenalty);
    const resources = materializeAll(await loadResources(db, row.id), ctx, now);
    const journey = await loadWorld(db, row.id);
    const classId = computeLoadout(await equippedOf(db, row.id), journey.sealedItems).classId;
    await db
      .update(expeditionMembers)
      .set({
        classId,
        sanity: resources.sanity.value,
        maxSanity: resourceMax('sanity', ctx),
        level: row.level,
      })
      .where(
        and(eq(expeditionMembers.expeditionId, run.id), eq(expeditionMembers.characterId, row.id)),
      );
  }
  const endsAt = new Date(now.getTime() + expeditionDurationMs(def));
  await db
    .update(expeditions)
    .set({
      status: 'running',
      startedAt: now,
      endsAt,
      seed: randomBytes(16).toString('base64url'),
    })
    .where(eq(expeditions.id, run.id));
  await writeAudit(db, who, {
    action: 'expedition.start',
    characterId: character.id,
    after: { id: run.id },
  });
  return runView(db, run.id);
}

async function grantPersonal(
  db: Executor,
  now: Date,
  member: { characterId: string; assist: boolean },
) {
  const lore = await loadLore(db, member.characterId, true);
  if (member.assist) {
    await saveLore(db, {
      ...lore,
      reputation: {
        ...lore.reputation,
        order: (lore.reputation.order ?? 0) + ASSIST_ORDER_REPUTATION,
      },
    });
    return;
  }
  await saveLore(db, {
    ...lore,
    seals: { ...lore.seals, order: (lore.seals.order ?? 0) + PERSONAL_SEALS },
  });
  await grantKeyShards(db, member.characterId, PERSONAL_SHARDS, now);
}

export async function resolveExpeditionRun(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  now: Date,
  expeditionId: string,
) {
  const run = await lockRun(db, expeditionId);
  const members = await memberRows(db, run.id);
  if (!members.some((member) => member.characterId === character.id)) {
    forbid('Nie ma cię w tej drużynie');
  }
  if (run.status === 'resolved' || run.status === 'split') return runView(db, run.id);
  if (run.status !== 'running' || !run.endsAt || !run.seed) forbid('Wyprawa jeszcze trwa');
  if (run.endsAt > now) forbid('Zejście jeszcze się nie skończyło');
  const def = findExpedition(run.defId);
  if (!def) forbid('Nieznana wyprawa');
  const resolved = resolveExpedition(
    def,
    members.map((member) => ({
      characterId: member.characterId,
      name: member.name,
      classId: asClass(member.classId),
      assist: member.assist,
      sanity: member.sanity ?? 0,
      maxSanity: member.maxSanity ?? 0,
    })),
    createRng(run.seed),
  );
  const ids = [...members.map((member) => member.characterId)].sort();
  for (const id of ids) await lockCharacter(db, id);
  for (const member of members) await grantPersonal(db, now, member);
  await db
    .update(expeditions)
    .set({
      status: 'resolved',
      pool: resolved.loot,
      sharedSanity: resolved.shared,
      missed: resolved.missed,
      betrayerId: resolved.betrayerId,
      log: resolved.log,
    })
    .where(eq(expeditions.id, run.id));
  await writeAudit(db, who, {
    action: 'expedition.resolve',
    characterId: character.id,
    after: { id: run.id, missed: resolved.missed, loot: resolved.loot },
  });
  return runView(db, run.id);
}

export async function splitExpedition(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  expeditionId: string,
  shares: readonly { characterId: string; amount: number }[],
) {
  const run = await lockRun(db, expeditionId);
  if (run.leaderId !== character.id) forbid('Tylko lider dzieli łup');
  if (run.status === 'split') return runView(db, run.id);
  if (run.status !== 'resolved' || run.pool === null) forbid('Najpierw zakończ zejście');
  const members = await memberRows(db, run.id);
  const sum = shares.reduce((total, share) => total + share.amount, 0);
  if (sum !== run.pool) forbid('Suma udziałów musi równać się puli');
  for (const member of members) {
    const share = shares.find((item) => item.characterId === member.characterId)?.amount ?? 0;
    if (!Number.isSafeInteger(share) || share < 0) forbid('Udział musi być liczbą nieujemną');
    if (member.assist && share !== 0) forbid('Asysta nie bierze łupu');
    if (!member.assist && !shares.some((item) => item.characterId === member.characterId)) {
      forbid('Każdy członek musi dostać udział');
    }
  }
  const ids = [...members.map((member) => member.characterId)].sort();
  const locked = new Map<string, CharacterRow>();
  for (const id of ids) locked.set(id, await lockCharacter(db, id));
  for (const member of members) {
    const share = shares.find((item) => item.characterId === member.characterId)?.amount ?? 0;
    await db
      .update(expeditionMembers)
      .set({ share })
      .where(
        and(
          eq(expeditionMembers.expeditionId, run.id),
          eq(expeditionMembers.characterId, member.characterId),
        ),
      );
    if (member.assist || share <= 0) continue;
    await postLedgerEntry(db, {
      characterId: member.characterId,
      currency: 'silver',
      delta: share,
      reason: 'expedition.share',
      refId: run.id,
      idempotencyKey: `expedition:${run.id}:share:${member.characterId}`,
    });
    const xp = shareExperience(share);
    const row = locked.get(member.characterId);
    if (row && xp > 0) await persistProgress(db, row, xp);
  }
  await db.update(expeditions).set({ status: 'split' }).where(eq(expeditions.id, run.id));
  await writeAudit(db, who, {
    action: 'expedition.split',
    characterId: character.id,
    after: { id: run.id },
  });
  return runView(db, run.id);
}

async function openEscort(db: Executor, characterId: string) {
  const [row] = await db
    .select()
    .from(escorts)
    .where(
      and(inArray(escorts.status, [...OPEN_ESCORT]), inArray(escorts.protectorId, [characterId])),
    )
    .limit(1);
  if (row) return row;
  const [ward] = await db
    .select()
    .from(escorts)
    .where(and(eq(escorts.wardId, characterId), inArray(escorts.status, [...OPEN_ESCORT])))
    .limit(1);
  return ward ?? null;
}

export async function offerEscort(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  wardId: string,
) {
  if (wardId === character.id) forbid('Nie eskortujesz samego siebie');
  const protector = await lockCharacter(db, character.id);
  const [ward] = await db.select().from(characters).where(eq(characters.id, wardId)).limit(1);
  if (!ward) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej postaci');
  const here = await loadWorld(db, protector.id);
  const there = await loadWorld(db, ward.id);
  if (here.travelTo || there.travelTo) forbid('Ktoś jest w drodze');
  if (here.city !== there.city) forbid('Eskorta działa w tym samym mieście');
  if (await openEscort(db, protector.id)) forbid('Masz już otwartą eskortę');
  if (await openEscort(db, ward.id)) forbid('Ta postać ma już eskortę');
  const [row] = await db
    .insert(escorts)
    .values({
      protectorId: protector.id,
      wardId: ward.id,
      city: here.city,
      status: 'offered',
    })
    .returning();
  if (!row) throw new Error('Nie udało się zaoferować eskorty');
  await writeAudit(db, who, {
    action: 'escort.offer',
    characterId: protector.id,
    after: { id: row.id, wardId },
  });
  return { id: row.id, status: row.status, city: row.city };
}

export async function acceptEscort(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  escortId: string,
) {
  await lockCharacter(db, character.id);
  const [row] = await db
    .select()
    .from(escorts)
    .where(eq(escorts.id, escortId))
    .limit(1)
    .for('update');
  if (!row) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej eskorty');
  if (row.wardId !== character.id) forbid('To nie twoja eskorta');
  if (row.status !== 'offered') forbid('Eskorta nie czeka na zgodę');
  await db.update(escorts).set({ status: 'active' }).where(eq(escorts.id, row.id));
  await writeAudit(db, who, {
    action: 'escort.accept',
    characterId: character.id,
    after: { id: row.id },
  });
  return { id: row.id, status: 'active' as const };
}

export async function endEscort(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  escortId: string,
) {
  await lockCharacter(db, character.id);
  const [row] = await db
    .select()
    .from(escorts)
    .where(eq(escorts.id, escortId))
    .limit(1)
    .for('update');
  if (!row) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej eskorty');
  if (row.wardId !== character.id && row.protectorId !== character.id)
    forbid('To nie twoja eskorta');
  await db.update(escorts).set({ status: 'ended' }).where(eq(escorts.id, row.id));
  await writeAudit(db, who, {
    action: 'escort.end',
    characterId: character.id,
    after: { id: row.id },
  });
  return { id: row.id, status: 'ended' as const };
}

/** Aktywna eskorta podopiecznego. Wołane z podróży po zablokowaniu postaci. */
export async function activeWardEscort(db: Executor, wardId: string): Promise<EscortRow | null> {
  const [row] = await db
    .select()
    .from(escorts)
    .where(and(eq(escorts.wardId, wardId), eq(escorts.status, 'active')))
    .limit(1);
  return row ?? null;
}

export function escortTravelChance(base: number, escort: EscortRow | null): number {
  return halvedByEscort(base, escort !== null && !escort.ambushTaken);
}

export async function absorbEscortFight(db: Executor, escort: EscortRow): Promise<void> {
  await db.update(escorts).set({ ambushTaken: true }).where(eq(escorts.id, escort.id));
  const lore = await loadLore(db, escort.protectorId, true);
  await saveLore(db, {
    ...lore,
    seals: { ...lore.seals, guard: (lore.seals.guard ?? 0) + ESCORT_GUARD_SEAL },
  });
}

export async function escortEventSanity(
  db: Executor,
  wardId: string,
  loss: number,
): Promise<number> {
  const escort = await activeWardEscort(db, wardId);
  if (!escort || escort.sanityCut) return loss;
  await db.update(escorts).set({ sanityCut: true }).where(eq(escorts.id, escort.id));
  return escortSanityLoss(loss, true);
}
