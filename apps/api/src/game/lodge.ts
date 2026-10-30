/**
 * Loże, Przyzwania, Kuter, Sny, mentorzy i Przebudzenie Boga (GDD 11, Etap 6).
 * Skarbiec i zapisy siedzą w transakcji. Klucze i Sigile nie wchodzą na giełdę.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import {
  CUTTER_COST,
  ERROR_CODES,
  KEY_RING_CAP,
  MENTOR_MIN_LEVEL,
  NIGHTMARE_SANITY,
  SUMMON_SIGNUP_MS,
  SUMMON_SILVER,
  VOYAGE_MS,
  awakeningDomain,
  awakeningMutator,
  awakeningReceipts,
  awakeningStat,
  awakeningWeekStart,
  calmSanityBonus,
  depthsDream,
  dreamSleptMs,
  isLodgeRole,
  keyRingBonus,
  lodgeAllows,
  lodgeLevel,
  lodgeSeats,
  lodgeXp,
  portalDomain,
  portalEnemyDamage,
  portalEnemyLife,
  portalEnemyStat,
  portalEquivalentFloor,
  portalFightIndex,
  resourceMax,
  sanityPenaltyForScars,
  scrollCost,
  scrollSigils,
  simulateCombat,
  skillPoints,
  voyageOutcome,
  type DreamPath,
  type LodgeAction,
  type LodgeRole,
  type LodgeSkill,
} from '@game/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { writeAudit, type AuditActor } from '../audit.js';
import type { Clock } from '../clock.js';
import type { Executor } from '../db/client.js';
import {
  awakeningPayouts,
  awakeningReceipts as receiptRows,
  awakeningRuns,
  characters,
  dreams,
  lodgeMembers,
  lodgeSignups,
  lodgeSummons,
  lodgeVoyages,
  lodges,
  marketStates,
  mentorships,
  portalStates,
  voyageSignups,
  type CharacterRow,
} from '../db/schema.js';
import { AppError, uniqueViolationConstraint } from '../errors.js';
import { lockCharacter } from './activities.js';
import { loadLore } from './lore-state.js';
import { dreamCombatant } from './portal.js';
import { grantKeyShards, loadPortal, materializePortal, savePortal } from './portal-state.js';
import { loadResources, resourceContext, saveResources } from './resources.js';
import { postLedgerEntry } from './wallet.js';

function forbid(role: string, action: LodgeAction): void {
  if (!isLodgeRole(role) || !lodgeAllows(role, action)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ta rola tego nie robi');
  }
}

async function lockLodge(db: Executor, lodgeId: string) {
  const [lodge] = await db
    .select()
    .from(lodges)
    .where(eq(lodges.id, lodgeId))
    .for('update')
    .limit(1);
  if (!lodge) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej loży');
  return lodge;
}

async function memberRow(db: Executor, characterId: string) {
  const [row] = await db
    .select()
    .from(lodgeMembers)
    .where(eq(lodgeMembers.characterId, characterId))
    .limit(1);
  return row ?? null;
}

async function requireMember(db: Executor, lodgeId: string, characterId: string) {
  const row = await memberRow(db, characterId);
  if (!row) throw new AppError(409, ERROR_CODES.requirement, 'Nie należysz do tej loży');
  if (row.lodgeId !== lodgeId) {
    throw new AppError(409, ERROR_CODES.requirement, 'Nie należysz do tej loży');
  }
  return row;
}

async function memberStats(db: Executor, lodgeId: string) {
  return db
    .select({
      characterId: lodgeMembers.characterId,
      role: lodgeMembers.role,
      experience: characters.experience,
      level: characters.level,
      name: characters.name,
    })
    .from(lodgeMembers)
    .innerJoin(characters, eq(characters.id, lodgeMembers.characterId))
    .where(eq(lodgeMembers.lodgeId, lodgeId));
}

async function applyKeyCap(db: Executor, characterId: string, skills: readonly string[]) {
  await db
    .update(portalStates)
    .set({ keyCap: KEY_RING_CAP + keyRingBonus(skills) })
    .where(eq(portalStates.characterId, characterId));
}

async function applyLodgeCaps(db: Executor, lodgeId: string, skills: readonly string[]) {
  const members = await db
    .select({ characterId: lodgeMembers.characterId })
    .from(lodgeMembers)
    .where(eq(lodgeMembers.lodgeId, lodgeId));
  for (const member of members) await applyKeyCap(db, member.characterId, skills);
}

async function addGood(db: Executor, characterId: string, goodId: string, qty: number) {
  const [row] = await db
    .select()
    .from(marketStates)
    .where(eq(marketStates.characterId, characterId))
    .for('update');
  if (!row) throw new Error(`Postać ${characterId} nie ma stanu giełdy`);
  const next = (row.goods[goodId] ?? 0) + qty;
  const goods = Object.fromEntries(
    Object.entries({ ...row.goods, [goodId]: next }).filter(([, have]) => have > 0),
  );
  await db.update(marketStates).set({ goods }).where(eq(marketStates.characterId, characterId));
}

export async function hallOf(db: Executor, characterId: string) {
  const rows = await db.select().from(lodges);
  const hall = [];
  for (const lodge of rows) {
    const members = await memberStats(db, lodge.id);
    const xp = lodgeXp(
      lodge.donationXp,
      members.reduce((sum, member) => sum + member.experience, 0),
    );
    hall.push({
      id: lodge.id,
      name: lodge.name,
      level: lodgeLevel(xp),
      members: members.length,
      seats: lodgeSeats(lodge.skills),
      recruitment: lodge.recruitment,
    });
  }
  const mine = await memberRow(db, characterId);
  return { hall, lodgeId: mine?.lodgeId ?? null };
}

export async function createLodge(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  name: string,
) {
  if (await memberRow(db, character.id)) {
    throw new AppError(409, ERROR_CODES.activityBusy, 'Należysz już do loży');
  }
  try {
    const [lodge] = await db.insert(lodges).values({ name }).returning();
    if (!lodge) throw new Error('INSERT nie zwrócił loży');
    await db.insert(lodgeMembers).values({
      lodgeId: lodge.id,
      characterId: character.id,
      role: 'master',
    });
    await writeAudit(db, who, {
      action: 'lodge.create',
      characterId: character.id,
      after: { id: lodge.id },
    });
    return { id: lodge.id, name: lodge.name, role: 'master' as const };
  } catch (error) {
    if (uniqueViolationConstraint(error)) {
      throw new AppError(409, ERROR_CODES.requirement, 'Ta nazwa jest zajęta');
    }
    throw error;
  }
}

export async function joinLodge(db: Executor, character: CharacterRow, lodgeId: string) {
  const lodge = await lockLodge(db, lodgeId);
  if (!lodge.recruitment) throw new AppError(409, ERROR_CODES.requirement, 'Loża nie werbuje');
  if (await memberRow(db, character.id)) {
    throw new AppError(409, ERROR_CODES.activityBusy, 'Należysz już do loży');
  }
  const members = await memberStats(db, lodge.id);
  if (members.length >= lodgeSeats(lodge.skills)) {
    throw new AppError(409, ERROR_CODES.requirement, 'W loży nie ma miejsca');
  }
  await db.insert(lodgeMembers).values({
    lodgeId: lodge.id,
    characterId: character.id,
    role: 'novice',
  });
  await applyKeyCap(db, character.id, lodge.skills);
  return { id: lodge.id, role: 'novice' as const };
}

export async function donate(
  db: Executor,
  character: CharacterRow,
  lodgeId: string,
  silver: number,
) {
  const lodge = await lockLodge(db, lodgeId);
  const member = await requireMember(db, lodge.id, character.id);
  forbid(member.role, 'donate');
  await postLedgerEntry(db, {
    characterId: character.id,
    currency: 'silver',
    delta: -silver,
    reason: 'lodge.donate',
    idempotencyKey: `lodge-donate:${lodge.id}:${randomUUID()}`,
  });
  const donationXp = lodge.donationXp + silver;
  const treasury = lodge.treasury + silver;
  await db.update(lodges).set({ donationXp, treasury }).where(eq(lodges.id, lodge.id));
  const members = await memberStats(db, lodge.id);
  const xp = lodgeXp(
    donationXp,
    members.reduce((sum, entry) => sum + entry.experience, 0),
  );
  return { treasury, level: lodgeLevel(xp) };
}

export async function withdraw(
  db: Executor,
  character: CharacterRow,
  lodgeId: string,
  silver: number,
) {
  const lodge = await lockLodge(db, lodgeId);
  const member = await requireMember(db, lodge.id, character.id);
  forbid(member.role, 'withdraw');
  if (lodge.treasury < silver)
    throw new AppError(409, ERROR_CODES.requirement, 'Skarbiec jest pusty');
  await db
    .update(lodges)
    .set({ treasury: lodge.treasury - silver })
    .where(eq(lodges.id, lodge.id));
  await postLedgerEntry(db, {
    characterId: character.id,
    currency: 'silver',
    delta: silver,
    reason: 'lodge.withdraw',
    idempotencyKey: `lodge-withdraw:${lodge.id}:${randomUUID()}`,
  });
  return { treasury: lodge.treasury - silver };
}

export async function setRole(
  db: Executor,
  character: CharacterRow,
  lodgeId: string,
  targetId: string,
  role: LodgeRole,
) {
  const lodge = await lockLodge(db, lodgeId);
  const actor = await requireMember(db, lodge.id, character.id);
  forbid(actor.role, 'setRole');
  if (role === 'master') throw new AppError(409, ERROR_CODES.requirement, 'Mistrz zostaje jeden');
  const target = await requireMember(db, lodge.id, targetId);
  if (target.role === 'master')
    throw new AppError(409, ERROR_CODES.requirement, 'Mistrza nie da się zsunąć');
  await db
    .update(lodgeMembers)
    .set({ role })
    .where(and(eq(lodgeMembers.lodgeId, lodge.id), eq(lodgeMembers.characterId, targetId)));
  return { characterId: targetId, role };
}

export async function learnSkill(
  db: Executor,
  character: CharacterRow,
  lodgeId: string,
  skill: LodgeSkill,
) {
  const lodge = await lockLodge(db, lodgeId);
  const actor = await requireMember(db, lodge.id, character.id);
  forbid(actor.role, 'learnSkill');
  if (lodge.skills.includes(skill))
    throw new AppError(409, ERROR_CODES.requirement, 'Loża już to umie');
  const members = await memberStats(db, lodge.id);
  const level = lodgeLevel(
    lodgeXp(
      lodge.donationXp,
      members.reduce((sum, entry) => sum + entry.experience, 0),
    ),
  );
  if (lodge.skills.length >= skillPoints(level)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Brak punktu umiejętności');
  }
  const skills = [...lodge.skills, skill];
  await db.update(lodges).set({ skills }).where(eq(lodges.id, lodge.id));
  await applyLodgeCaps(db, lodge.id, skills);
  return { skills };
}

export async function setRecruitment(
  db: Executor,
  character: CharacterRow,
  lodgeId: string,
  open: boolean,
) {
  const lodge = await lockLodge(db, lodgeId);
  const actor = await requireMember(db, lodge.id, character.id);
  forbid(actor.role, 'setRecruitment');
  await db.update(lodges).set({ recruitment: open }).where(eq(lodges.id, lodge.id));
  return { recruitment: open };
}

export async function buyScroll(
  db: Executor,
  character: CharacterRow,
  clock: Clock,
  lodgeId: string,
  tier: number,
) {
  const lodge = await lockLodge(db, lodgeId);
  const actor = await requireMember(db, lodge.id, character.id);
  forbid(actor.role, 'buyScroll');
  if (!(tier === 1 || tier === 2 || tier === 3)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Zwój ma Stopień I–III');
  }
  const [open] = await db
    .select()
    .from(lodgeSummons)
    .where(and(eq(lodgeSummons.lodgeId, lodge.id), eq(lodgeSummons.status, 'signing')))
    .limit(1);
  if (open) throw new AppError(409, ERROR_CODES.activityBusy, 'Rytuał już czeka na zapis');
  const cost = scrollCost(tier);
  if (lodge.treasury < cost)
    throw new AppError(409, ERROR_CODES.requirement, 'Skarbiec nie udźwignie Zwoju');
  await db
    .update(lodges)
    .set({ treasury: lodge.treasury - cost })
    .where(eq(lodges.id, lodge.id));
  const fightAt = new Date(clock.now().getTime() + SUMMON_SIGNUP_MS);
  const [summon] = await db
    .insert(lodgeSummons)
    .values({ lodgeId: lodge.id, tier, fightAt })
    .returning();
  if (!summon) throw new Error('INSERT nie zwrócił Przyzwania');
  return { summonId: summon.id, fightAt: fightAt.toISOString(), treasury: lodge.treasury - cost };
}

export async function signupSummon(
  db: Executor,
  character: CharacterRow,
  clock: Clock,
  lodgeId: string,
  summonId: string,
) {
  const lodge = await lockLodge(db, lodgeId);
  const actor = await requireMember(db, lodge.id, character.id);
  forbid(actor.role, 'signup');
  const [summon] = await db
    .select()
    .from(lodgeSummons)
    .where(and(eq(lodgeSummons.id, summonId), eq(lodgeSummons.lodgeId, lodge.id)))
    .limit(1);
  if (!summon) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego Przyzwania');
  if (summon.status !== 'signing') {
    throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego Przyzwania');
  }
  if (clock.now() >= summon.fightAt) {
    throw new AppError(409, ERROR_CODES.requirement, 'Zapisy już zamknięte');
  }
  await db
    .insert(lodgeSignups)
    .values({ summonId: summon.id, characterId: character.id })
    .onConflictDoNothing();
  return { summonId: summon.id };
}

export async function resolveSummon(db: Executor, clock: Clock, lodgeId: string, summonId: string) {
  const lodge = await lockLodge(db, lodgeId);
  const [summon] = await db
    .select()
    .from(lodgeSummons)
    .where(and(eq(lodgeSummons.id, summonId), eq(lodgeSummons.lodgeId, lodge.id)))
    .for('update')
    .limit(1);
  if (!summon) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego Przyzwania');
  if (summon.status === 'resolved') return summon.replay;
  if (clock.now() < summon.fightAt) {
    throw new AppError(409, ERROR_CODES.activityNotReady, 'Rytuał jeszcze trwa');
  }
  const signed = await db.select().from(lodgeSignups).where(eq(lodgeSignups.summonId, summon.id));
  const ids = signed.map((row) => row.characterId).sort();
  for (const id of ids) await lockCharacter(db, id);
  const levels = new Map<string, number>();
  if (ids.length > 0) {
    const rows = await db
      .select({ id: characters.id, level: characters.level })
      .from(characters)
      .where(inArray(characters.id, ids));
    for (const row of rows) levels.set(row.id, row.level);
  }
  const power = ids.reduce((sum, id) => sum + (levels.get(id) ?? 1), 0);
  const seed = randomBytes(16).toString('base64url');
  const won =
    ids.length > 0 &&
    simulateCombat(
      {
        level: Math.max(1, power),
        stats: {
          strength: 20 * power,
          defense: 20 * power,
          accuracy: 20 * power,
          evasion: 20 * power,
        },
        life: 50 * Math.max(1, power),
        maxLife: 50 * Math.max(1, power),
        sanity: 100,
        maxSanity: 100,
        classId: null,
        weaponDamage: 5 + power,
        knowledge: 0,
      },
      {
        stats: {
          strength: 30 * summon.tier,
          defense: 30 * summon.tier,
          accuracy: 30 * summon.tier,
          evasion: 10,
        },
        life: 40 * summon.tier,
        damage: 8 * summon.tier,
        dread: 1,
        gaze: false,
      },
      seed,
    ).winner === 'player';
  const sigilCount = won ? scrollSigils(summon.tier) : 0;
  const recipients = ids.slice(0, sigilCount);
  for (const id of recipients) {
    const portal = materializePortal(await loadPortal(db, id, true), clock.now());
    const key = '6';
    await savePortal(db, {
      ...portal,
      sigils: { ...portal.sigils, [key]: (portal.sigils[key] ?? 0) + 1 },
    });
    await addGood(db, id, 'heart:demonic', 1);
  }
  const silverEach =
    won && ids.length > 0 ? Math.floor((SUMMON_SILVER * summon.tier) / ids.length) : 0;
  const remainder = won ? SUMMON_SILVER * summon.tier - silverEach * ids.length : 0;
  for (const id of ids) {
    if (silverEach <= 0) continue;
    await postLedgerEntry(db, {
      characterId: id,
      currency: 'silver',
      delta: silverEach,
      reason: 'lodge.summon',
      idempotencyKey: `summon:${summon.id}:${id}`,
    });
  }
  if (remainder > 0) {
    await db
      .update(lodges)
      .set({ treasury: lodge.treasury + remainder })
      .where(eq(lodges.id, lodge.id));
  }
  const replay = {
    won,
    signups: ids.length,
    sigilRecipients: recipients,
    silverEach,
    rounds: won ? 'rite' : 'broken',
  };
  await db
    .update(lodgeSummons)
    .set({ status: 'resolved', replay })
    .where(eq(lodgeSummons.id, summon.id));
  return replay;
}

export async function buildCutter(db: Executor, character: CharacterRow, lodgeId: string) {
  const lodge = await lockLodge(db, lodgeId);
  const actor = await requireMember(db, lodge.id, character.id);
  forbid(actor.role, 'buildCutter');
  if (!lodge.skills.includes('fleet')) {
    throw new AppError(409, ERROR_CODES.requirement, 'Najpierw umiejętność Flota');
  }
  if (lodge.cutter) throw new AppError(409, ERROR_CODES.requirement, 'Kuter już stoi w porcie');
  if (lodge.treasury < CUTTER_COST) {
    throw new AppError(409, ERROR_CODES.requirement, 'Skarbiec nie udźwignie Kutra');
  }
  await db
    .update(lodges)
    .set({ cutter: true, treasury: lodge.treasury - CUTTER_COST })
    .where(eq(lodges.id, lodge.id));
  return { cutter: true, treasury: lodge.treasury - CUTTER_COST };
}

export async function startVoyage(
  db: Executor,
  character: CharacterRow,
  clock: Clock,
  lodgeId: string,
) {
  const lodge = await lockLodge(db, lodgeId);
  const actor = await requireMember(db, lodge.id, character.id);
  forbid(actor.role, 'startVoyage');
  if (!lodge.cutter) throw new AppError(409, ERROR_CODES.requirement, 'Loża nie ma Kutra');
  const [open] = await db
    .select()
    .from(lodgeVoyages)
    .where(and(eq(lodgeVoyages.lodgeId, lodge.id), eq(lodgeVoyages.status, 'sailing')))
    .limit(1);
  if (open) throw new AppError(409, ERROR_CODES.activityBusy, 'Kuter już wyszedł');
  const endsAt = new Date(clock.now().getTime() + VOYAGE_MS);
  const [voyage] = await db.insert(lodgeVoyages).values({ lodgeId: lodge.id, endsAt }).returning();
  if (!voyage) throw new Error('INSERT nie zwrócił rejsu');
  return { voyageId: voyage.id, endsAt: endsAt.toISOString() };
}

export async function signupVoyage(
  db: Executor,
  character: CharacterRow,
  lodgeId: string,
  voyageId: string,
) {
  const lodge = await lockLodge(db, lodgeId);
  const actor = await requireMember(db, lodge.id, character.id);
  forbid(actor.role, 'signup');
  const [voyage] = await db
    .select()
    .from(lodgeVoyages)
    .where(and(eq(lodgeVoyages.id, voyageId), eq(lodgeVoyages.lodgeId, lodge.id)))
    .limit(1);
  if (!voyage) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego rejsu');
  if (voyage.status !== 'sailing') {
    throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego rejsu');
  }
  await db
    .insert(voyageSignups)
    .values({ voyageId: voyage.id, characterId: character.id })
    .onConflictDoNothing();
  return { voyageId: voyage.id };
}

export async function resolveVoyage(db: Executor, clock: Clock, lodgeId: string, voyageId: string) {
  const lodge = await lockLodge(db, lodgeId);
  const [voyage] = await db
    .select()
    .from(lodgeVoyages)
    .where(and(eq(lodgeVoyages.id, voyageId), eq(lodgeVoyages.lodgeId, lodge.id)))
    .for('update')
    .limit(1);
  if (!voyage) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego rejsu');
  if (voyage.status === 'resolved') return voyage.result;
  if (clock.now() < voyage.endsAt)
    throw new AppError(409, ERROR_CODES.activityNotReady, 'Kuter jeszcze w morzu');
  const signed = await db.select().from(voyageSignups).where(eq(voyageSignups.voyageId, voyage.id));
  const ids = signed.map((row) => row.characterId).sort();
  const outcome = voyageOutcome(`${voyage.id}:${lodge.id}`, ids.length);
  const each = ids.length > 0 ? Math.floor(outcome.catch / ids.length) : 0;
  for (const id of ids) {
    await lockCharacter(db, id);
    if (each > 0) await addGood(db, id, 'fillet:filet', each);
  }
  const result = { ...outcome, signups: ids.length };
  await db
    .update(lodgeVoyages)
    .set({ status: 'resolved', result })
    .where(eq(lodgeVoyages.id, voyage.id));
  return result;
}

export async function startDream(
  db: Executor,
  character: CharacterRow,
  clock: Clock,
  path: DreamPath,
) {
  const [existing] = await db
    .select()
    .from(dreams)
    .where(eq(dreams.characterId, character.id))
    .for('update')
    .limit(1);
  if (existing && !existing.resolvedAt) {
    throw new AppError(409, ERROR_CODES.activityBusy, 'Postać już śni');
  }
  if (path === 'shared' && !(await memberRow(db, character.id))) {
    throw new AppError(409, ERROR_CODES.requirement, 'Sen Wspólny chce loży');
  }
  const startedAt = clock.now();
  if (existing) {
    await db
      .update(dreams)
      .set({ path, startedAt, resolvedAt: null })
      .where(eq(dreams.characterId, character.id));
  } else {
    await db.insert(dreams).values({ characterId: character.id, path, startedAt });
  }
  return { path, startedAt: startedAt.toISOString() };
}

export async function wakeDream(db: Executor, character: CharacterRow, clock: Clock) {
  const now = clock.now();
  const [dream] = await db
    .select()
    .from(dreams)
    .where(eq(dreams.characterId, character.id))
    .for('update')
    .limit(1);
  if (!dream || dream.resolvedAt) throw new AppError(409, ERROR_CODES.requirement, 'Nikt nie śpi');
  const slept = dreamSleptMs(dream.startedAt.getTime(), now.getTime());
  const lore = await loadLore(db, character.id, true);
  const ctx = resourceContext(character.level, lore.knowledge, sanityPenaltyForScars(lore.scars));
  let resources = await loadResources(db, character.id, { forUpdate: true });
  let note = 'pusty';
  if (dream.path === 'calm') {
    const bonus = calmSanityBonus(slept);
    if (bonus > 0) {
      const max = resourceMax('sanity', ctx);
      const current = resources.sanity;
      const value = Math.min(max, current.value + bonus);
      resources = { ...resources, sanity: { value, updatedAt: now.getTime() } };
    }
    note = 'spokojny';
  } else if (dream.path === 'depths') {
    const roll = depthsDream(`${character.id}:${dream.startedAt.toISOString()}`);
    if (roll === 'shard') {
      await grantKeyShards(db, character.id, 1, now);
      note = 'odłamek';
    } else if (roll === 'nightmare') {
      const value = Math.max(0, resources.sanity.value - NIGHTMARE_SANITY);
      resources = { ...resources, sanity: { value, updatedAt: now.getTime() } };
      note = 'koszmar';
    }
  } else {
    await grantKeyShards(db, character.id, 1, now);
    note = 'wspólny';
  }
  await saveResources(db, character.id, resources);
  await db.update(dreams).set({ resolvedAt: now }).where(eq(dreams.characterId, character.id));
  return { path: dream.path, slept, note };
}

export async function takeMentor(db: Executor, character: CharacterRow, menteeId: string) {
  if (character.level < MENTOR_MIN_LEVEL) {
    throw new AppError(409, ERROR_CODES.requirement, 'Urząd chce mentora od poziomu 15');
  }
  if (menteeId === character.id)
    throw new AppError(409, ERROR_CODES.requirement, 'Nie mentorujesz siebie');
  const [mentee] = await db.select().from(characters).where(eq(characters.id, menteeId)).limit(1);
  if (!mentee) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego ucznia');
  if (mentee.level >= character.level) {
    throw new AppError(409, ERROR_CODES.requirement, 'Uczeń musi być niżej');
  }
  const [taken] = await db
    .select()
    .from(mentorships)
    .where(eq(mentorships.menteeId, menteeId))
    .limit(1);
  if (taken) throw new AppError(409, ERROR_CODES.activityBusy, 'Uczeń ma już mentora');
  await db.insert(mentorships).values({ mentorId: character.id, menteeId });
  return { mentorId: character.id, menteeId };
}

export async function climbAwakening(db: Executor, character: CharacterRow, clock: Clock) {
  const now = clock.now();
  await lockCharacter(db, character.id);
  const week = awakeningWeekStart(now.getTime());
  const domain = awakeningDomain(week);
  const portal = materializePortal(await loadPortal(db, character.id, true), now);
  if (portal.clearedDomain < domain) {
    throw new AppError(409, ERROR_CODES.requirement, 'Najpierw pokonaj awatara tego boga');
  }
  const key = String(domain);
  const have = portal.sigils[key] ?? 0;
  if (have < 1) throw new AppError(409, ERROR_CODES.noSigil, 'Potrzeba Sigilu tego boga');
  const [run] = await db
    .select()
    .from(awakeningRuns)
    .where(and(eq(awakeningRuns.weekStart, week), eq(awakeningRuns.characterId, character.id)))
    .limit(1);
  const nextLevel = (run?.level ?? 0) + 1;
  const coord = { domain, stage: 10, substage: 8 };
  const floor = portalEquivalentFloor(portalFightIndex(coord));
  const mutator = awakeningMutator(week);
  const body = await dreamCombatant(
    db,
    character,
    { ...portal, sigils: { ...portal.sigils, [key]: have - 1 } },
    now,
  );
  const seed = randomBytes(16).toString('base64url');
  const won =
    simulateCombat(
      body.player,
      {
        stats: {
          strength: Math.round(
            awakeningStat(portalEnemyStat(floor, 'avatar'), nextLevel) * mutator,
          ),
          defense: Math.round(awakeningStat(portalEnemyStat(floor, 'avatar'), nextLevel) * mutator),
          accuracy: Math.round(
            awakeningStat(portalEnemyStat(floor, 'avatar'), nextLevel) * mutator,
          ),
          evasion: Math.round(awakeningStat(portalEnemyStat(floor, 'avatar'), nextLevel) * mutator),
        },
        life: Math.max(
          1,
          Math.round(awakeningStat(portalEnemyLife(floor, 'avatar'), nextLevel) * mutator),
        ),
        damage: Math.max(
          1,
          Math.round(awakeningStat(portalEnemyDamage(floor, 'avatar'), nextLevel) * mutator),
        ),
        dread: 1,
        gaze: false,
      },
      seed,
    ).winner === 'player';
  await savePortal(db, { ...portal, sigils: { ...portal.sigils, [key]: have - 1 } });
  const membership = await memberRow(db, character.id);
  if (won) {
    if (run) {
      await db
        .update(awakeningRuns)
        .set({ level: nextLevel })
        .where(and(eq(awakeningRuns.weekStart, week), eq(awakeningRuns.characterId, character.id)));
    } else {
      await db.insert(awakeningRuns).values({
        weekStart: week,
        characterId: character.id,
        lodgeId: membership?.lodgeId ?? null,
        level: nextLevel,
      });
    }
  }
  return { week, domain, won, level: won ? nextLevel : (run?.level ?? 0) };
}

async function addReceipts(db: Executor, characterId: string, amount: number) {
  if (amount <= 0) return;
  const [row] = await db
    .select()
    .from(receiptRows)
    .where(eq(receiptRows.characterId, characterId))
    .for('update')
    .limit(1);
  if (!row) {
    await db.insert(receiptRows).values({ characterId, amount });
    return;
  }
  await db
    .update(receiptRows)
    .set({ amount: row.amount + amount })
    .where(eq(receiptRows.characterId, characterId));
}

export async function settleAwakening(db: Executor, clock: Clock) {
  await db.execute(sql`select pg_advisory_xact_lock(641006)`);
  const now = clock.now();
  const current = awakeningWeekStart(now.getTime());
  const runs = await db.select().from(awakeningRuns);
  const weeks = [...new Set(runs.map((run) => run.weekStart))]
    .filter((week) => week < current)
    .sort();
  const paid: string[] = [];
  for (const week of weeks) {
    const [already] = await db
      .select()
      .from(awakeningPayouts)
      .where(eq(awakeningPayouts.weekStart, week))
      .limit(1);
    if (already) continue;
    const weekRuns = runs
      .filter((run) => run.weekStart === week)
      .sort((a, b) => b.level - a.level || a.characterId.localeCompare(b.characterId));
    const players = weekRuns.map((run, index) => ({
      characterId: run.characterId,
      level: run.level,
      rank: index + 1,
      receipts: awakeningReceipts(index + 1),
    }));
    for (const player of players) await addReceipts(db, player.characterId, player.receipts);
    const byLodge = new Map<string, number>();
    for (const run of weekRuns) {
      if (!run.lodgeId) continue;
      byLodge.set(run.lodgeId, (byLodge.get(run.lodgeId) ?? 0) + run.level);
    }
    const lodgesRanked = [...byLodge.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([lodgeId, score], index) => ({ lodgeId, score, rank: index + 1 }));
    await db.insert(awakeningPayouts).values({
      weekStart: week,
      paidAt: now,
      ranks: { players, lodges: lodgesRanked },
    });
    paid.push(week);
  }
  return { paid };
}

export async function awakeningOf(db: Executor, characterId: string, clock: Clock) {
  const week = awakeningWeekStart(clock.now().getTime());
  const domain = awakeningDomain(week);
  const [run] = await db
    .select()
    .from(awakeningRuns)
    .where(and(eq(awakeningRuns.weekStart, week), eq(awakeningRuns.characterId, characterId)))
    .limit(1);
  const [receipts] = await db
    .select()
    .from(receiptRows)
    .where(eq(receiptRows.characterId, characterId))
    .limit(1);
  return {
    week,
    domain,
    domainName: portalDomain(domain)?.god ?? 'Milczący',
    level: run?.level ?? 0,
    receipts: receipts?.amount ?? 0,
  };
}

export async function inLodge(db: Executor, characterId: string): Promise<boolean> {
  return Boolean(await memberRow(db, characterId));
}
