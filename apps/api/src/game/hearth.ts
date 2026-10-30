/**
 * Dom, rytuały, Przysięga, kult, Skażenie i Rany (Etap 7).
 * Nie importuje `lore.ts`, `portal.ts`, `world.ts` ani `stage1.ts` — tamte wołają stąd.
 */
import { randomBytes } from 'node:crypto';

import {
  CASE_RITUAL_CANDLES,
  CULT_INVITE_CIRCLE,
  CULT_INVITE_LEVEL,
  CULT_MATERIAL_FACTOR,
  CULT_ORDER_SILVER,
  CULT_ORDER_SUSPICION,
  DAY_MS,
  DIRECTED_ECHO,
  ERROR_CODES,
  HIDEOUT_SILVER,
  HOUR_MS,
  MARTYR_SILVER,
  OPENING_TOME,
  REPUTATION_THRESHOLDS,
  ROOM_MAX_LEVEL,
  SALT_BUFF_MS,
  STAR_SALT_CONTAMINATION,
  SUSPICION_MAX,
  WRATH_STAT_FACTOR,
  addContamination,
  aspectEdge,
  bedroomVigorBp,
  circleBonus,
  cultRankFor,
  domainAspect,
  domainContaminationTenths,
  findHouse,
  findRitual,
  findSleeper,
  houseSellValue,
  houseUpkeepDays,
  isOathWindow,
  missingMaterial,
  nextCircle,
  nextMutationThreshold,
  oathEffectiveAt,
  offerMutations,
  ritualChance,
  rollRitual,
  rollWound,
  roomUpgradeCost,
  sealSigilCount,
  settleUpkeep,
  simulateCombat,
  statUnits,
  utcDay,
  type RitualOutcome,
  type RoomId,
  ROOMS,
  createRng,
  generateCase,
  resourceMax,
  spendResource,
} from '@game/shared';
import { eq } from 'drizzle-orm';

import type { Executor } from '../db/client.js';
import {
  characterStats,
  hearthStates,
  type CharacterRow,
  type HearthStateRow,
} from '../db/schema.js';
import { AppError } from '../errors.js';
import { lockCharacter } from './activities.js';
import { loadLore, saveLore } from './lore-state.js';
import { loadPortal, savePortal } from './portal-state.js';
import { loadResources, materializeAll, resourceContext, saveResources } from './resources.js';
import { postLedgerEntry, walletOf } from './wallet.js';
import { loadWorld, saveWorld } from './world-state.js';

const SUSPECT_REPUTATION = REPUTATION_THRESHOLDS[1];

function forbid(message: string): never {
  throw new AppError(409, ERROR_CODES.requirement, message);
}

async function ensure(
  db: Executor,
  characterId: string,
  forUpdate: boolean,
): Promise<HearthStateRow> {
  await db.insert(hearthStates).values({ characterId }).onConflictDoNothing();
  const query = db
    .select()
    .from(hearthStates)
    .where(eq(hearthStates.characterId, characterId))
    .limit(1);
  const [row] = forUpdate ? await query.for('update') : await query;
  if (!row) throw new Error(`Postać ${characterId} nie ma progu domu`);
  return row;
}

async function save(db: Executor, row: HearthStateRow): Promise<void> {
  const { characterId, ...rest } = row;
  await db.update(hearthStates).set(rest).where(eq(hearthStates.characterId, characterId));
}

function applyPending(row: HearthStateRow, now: Date): HearthStateRow {
  if (!row.pendingSleeper || !row.pendingFrom || row.pendingFrom > now) return row;
  const same = row.sleeper === row.pendingSleeper;
  const switching = Boolean(row.sleeper) && !same;
  return {
    ...row,
    sleeper: row.pendingSleeper,
    circle: nextCircle(Boolean(row.sleeper) && same, row.circle),
    wrathUntil: switching ? new Date(row.pendingFrom.getTime() + 7 * DAY_MS) : row.wrathUntil,
    pendingSleeper: null,
    pendingFrom: null,
  };
}

async function decay(db: Executor, row: HearthStateRow, now: Date): Promise<HearthStateRow> {
  const today = utcDay(now.getTime());
  if (row.decayDay === today) return row;
  const world = await loadWorld(db, row.characterId, true);
  const value =
    world.contamination > 0 && world.contamination < 25
      ? world.contamination - 1
      : world.contamination;
  if (value !== world.contamination) {
    await saveWorld(db, { ...world, contamination: value });
  }
  return { ...row, decayDay: today };
}

async function settleHouse(db: Executor, row: HearthStateRow, now: Date): Promise<HearthStateRow> {
  if (!row.houseId || (row.buildEndsAt && row.buildEndsAt > now)) return row;
  const house = findHouse(row.houseId);
  if (!house) return row;
  const today = utcDay(now.getTime());
  const owed = houseUpkeepDays(row.paidThrough, today);
  if (owed === 0) return { ...row, arrears: false };
  const silver = (await walletOf(db, row.characterId)).silver;
  const bill = settleUpkeep(house.upkeep, owed, silver);
  if (bill.spent > 0) {
    await postLedgerEntry(db, {
      characterId: row.characterId,
      currency: 'silver',
      delta: -bill.spent,
      reason: 'house.upkeep',
      idempotencyKey: `upkeep:${row.characterId}:${today}:${row.paidThrough ?? 'start'}`,
    });
  }
  let paidThrough = row.paidThrough;
  for (let day = 0; day < bill.paidDays; day += 1) {
    paidThrough = paidThrough ? utcDay(Date.parse(`${paidThrough}T00:00:00.000Z`) + DAY_MS) : today;
  }
  return { ...row, paidThrough, arrears: bill.arrears };
}

async function prepare(db: Executor, characterId: string, now: Date): Promise<HearthStateRow> {
  await lockCharacter(db, characterId);
  let row = applyPending(await ensure(db, characterId, true), now);
  row = await decay(db, row, now);
  row = await settleHouse(db, row, now);
  await save(db, row);
  return row;
}

function built(row: HearthStateRow, now: Date): boolean {
  return Boolean(row.houseId) && (!row.buildEndsAt || row.buildEndsAt <= now);
}

function cellarLevel(row: HearthStateRow): number {
  if (row.arrears) return 0;
  return row.rooms.cellar ?? 0;
}

async function gainTenths(
  db: Executor,
  row: HearthStateRow,
  deltaTenths: number,
  now: Date,
): Promise<HearthStateRow> {
  if (deltaTenths === 0) return row;
  const world = await loadWorld(db, row.characterId, true);
  const next = addContamination(world.contamination, world.contaminationTenths, deltaTenths);
  await saveWorld(db, { ...world, contamination: next.value, contaminationTenths: next.tenths });
  return syncOffer(row, next.value, now);
}

function syncOffer(row: HearthStateRow, value: number, now: Date): HearthStateRow {
  if (row.mutationOffer && row.mutationOffer.length > 0) return row;
  const threshold = nextMutationThreshold(value, row.chosenThresholds);
  if (threshold === null) return row;
  const offer = offerMutations(
    createRng(`mutacja:${row.characterId}:${threshold}:${utcDay(now.getTime())}`),
    row.mutations,
  );
  return { ...row, mutationOffer: offer };
}

async function unmask(db: Executor, row: HearthStateRow, now: Date): Promise<HearthStateRow> {
  if (row.unmaskedUntil && row.unmaskedUntil > now) return row;
  const lore = await loadLore(db, row.characterId, true);
  await saveLore(db, { ...lore, reputation: { ...lore.reputation, order: SUSPECT_REPUTATION } });
  await postLedgerEntry(db, {
    characterId: row.characterId,
    currency: 'silver',
    delta: MARTYR_SILVER,
    reason: 'cult.martyr',
    idempotencyKey: `martyr:${row.characterId}:${utcDay(now.getTime())}`,
  });
  return { ...row, unmaskedUntil: new Date(now.getTime() + 7 * DAY_MS) };
}

function paySilver(db: Executor, characterId: string, delta: number, reason: string, key: string) {
  return postLedgerEntry(db, {
    characterId,
    currency: 'silver',
    delta,
    reason,
    idempotencyKey: key,
  });
}

export async function hearthOf(db: Executor, character: CharacterRow, now: Date) {
  const row = await prepare(db, character.id, now);
  const world = await loadWorld(db, character.id);
  const house = row.houseId ? findHouse(row.houseId) : undefined;
  const sleeper = row.sleeper ? findSleeper(row.sleeper) : undefined;
  const activeWounds = row.wounds.filter((wound) => Date.parse(wound.until) > now.getTime());
  return {
    house: house
      ? {
          id: house.id,
          name: house.name,
          built: built(row, now),
          arrears: row.arrears,
          rooms: row.rooms,
          roomCap: house.rooms,
          upkeep: house.upkeep,
        }
      : null,
    oath: sleeper
      ? {
          id: sleeper.id,
          name: sleeper.name,
          aspect: sleeper.aspectName,
          circle: row.circle,
          wrath: Boolean(row.wrathUntil && row.wrathUntil > now),
        }
      : null,
    cult: row.cultSleeper
      ? {
          sleeper: row.cultSleeper,
          rank: cultRankFor(row.cultOrders),
          suspicion: row.suspicion,
          unmasked: Boolean(row.unmaskedUntil && row.unmaskedUntil > now),
        }
      : null,
    contamination: world.contamination,
    mutations: row.mutations,
    offer: row.mutationOffer ?? [],
    hideout: row.hideout,
    hideoutLooted: row.hideoutLooted,
    wounds: activeWounds.length,
    candles: row.candles,
    vigorBonusBp: bedroomVigorBp(row.rooms.bedroom ?? 0, row.arrears),
    saltThreshold: Boolean(row.buffUntil && row.buffUntil > now),
  };
}

export async function buyHouse(db: Executor, character: CharacterRow, now: Date, houseId: string) {
  const house = findHouse(houseId);
  if (!house) forbid('Nie ma takiego domu');
  const row = await prepare(db, character.id, now);
  if (row.houseId) forbid('Masz już dom');
  const missing = missingMaterial(row.materials, house.materials);
  if (missing) forbid(`Brakuje materiału: ${missing}`);
  const silver = (await walletOf(db, character.id)).silver;
  if (silver < house.price) forbid('Za mało srebra');
  await paySilver(
    db,
    character.id,
    -house.price,
    'house.buy',
    `house:${character.id}:${now.toISOString()}`,
  );
  const materials = { ...row.materials };
  for (const [id, qty] of Object.entries(house.materials))
    materials[id] = (materials[id] ?? 0) - qty;
  const next = {
    ...row,
    houseId: house.id,
    buildEndsAt: new Date(now.getTime() + house.buildMs),
    paidThrough: null,
    arrears: false,
    materials,
  };
  await save(db, next);
  return { houseId: house.id, endsAt: next.buildEndsAt.toISOString() };
}

export async function sellHouse(db: Executor, character: CharacterRow, now: Date) {
  const row = await prepare(db, character.id, now);
  if (!built(row, now) || !row.houseId) forbid('Dom jeszcze stoi w budowie');
  const house = findHouse(row.houseId);
  if (!house) forbid('Nie ma takiego domu');
  const refund = houseSellValue(house.price);
  await paySilver(
    db,
    character.id,
    refund,
    'house.sell',
    `sell:${character.id}:${now.toISOString()}`,
  );
  await save(db, {
    ...row,
    houseId: null,
    buildEndsAt: null,
    paidThrough: null,
    arrears: false,
    rooms: {},
  });
  return { silver: refund };
}

export async function upgradeRoom(db: Executor, character: CharacterRow, now: Date, room: RoomId) {
  if (!ROOMS.includes(room)) forbid('Nie ma takiego pokoju');
  const row = await prepare(db, character.id, now);
  if (!built(row, now) || !row.houseId) forbid('Najpierw skończ budowę');
  if (row.arrears) forbid('Zaległość gasi pokoje');
  const house = findHouse(row.houseId);
  if (!house) forbid('Nie ma takiego domu');
  const level = row.rooms[room] ?? 0;
  if (level >= ROOM_MAX_LEVEL) forbid('Pokój jest już na szczycie');
  const used = Object.values(row.rooms).filter((value) => value > 0).length;
  if (level === 0 && used >= house.rooms) forbid('W tym domu nie ma już miejsca');
  const cost = roomUpgradeCost(level + 1);
  const silver = (await walletOf(db, character.id)).silver;
  if (silver < cost) forbid('Za mało srebra');
  await paySilver(
    db,
    character.id,
    -cost,
    'house.room',
    `room:${character.id}:${room}:${level + 1}`,
  );
  await save(db, { ...row, rooms: { ...row.rooms, [room]: level + 1 } });
  return { room, level: level + 1 };
}

export async function swearOath(
  db: Executor,
  character: CharacterRow,
  now: Date,
  sleeperId: string,
) {
  if (!findSleeper(sleeperId)) forbid('Nie ma takiego Śpiącego');
  if (!isOathWindow(now.getTime())) forbid('Przysięga przyjmuje tylko w poniedziałek');
  const row = await prepare(db, character.id, now);
  const pendingFrom = new Date(oathEffectiveAt(now.getTime()));
  await save(db, { ...row, pendingSleeper: sleeperId, pendingFrom });
  return { sleeper: sleeperId, from: pendingFrom.toISOString() };
}

export async function joinCult(db: Executor, character: CharacterRow, now: Date) {
  const row = await prepare(db, character.id, now);
  if (character.level < CULT_INVITE_LEVEL) forbid('Kult woła od poziomu 20');
  if (!row.sleeper || row.circle < CULT_INVITE_CIRCLE) forbid('Przysięga musi trwać dwa tygodnie');
  if (row.cultSleeper) forbid('Już należysz do kultu');
  await save(db, { ...row, cultSleeper: row.sleeper, cultOrders: 0 });
  return { sleeper: row.sleeper, rank: cultRankFor(0) };
}

export async function cultOrder(db: Executor, character: CharacterRow, now: Date) {
  let row = await prepare(db, character.id, now);
  if (!row.cultSleeper) forbid('Nie należysz do kultu');
  const suspicion = Math.min(SUSPICION_MAX, row.suspicion + CULT_ORDER_SUSPICION);
  row = {
    ...row,
    cultOrders: row.cultOrders + 1,
    suspicion,
  };
  if (suspicion >= SUSPICION_MAX) row = await unmask(db, row, now);
  await paySilver(
    db,
    character.id,
    CULT_ORDER_SILVER,
    'cult.order',
    `cult:${character.id}:${row.cultOrders}`,
  );
  await save(db, row);
  return { rank: cultRankFor(row.cultOrders), suspicion: row.suspicion };
}

export async function drinkSalt(db: Executor, character: CharacterRow, now: Date) {
  let row = await prepare(db, character.id, now);
  row = await gainTenths(db, row, STAR_SALT_CONTAMINATION * 10, now);
  await save(db, row);
  const world = await loadWorld(db, character.id);
  return { contamination: world.contamination, offer: row.mutationOffer ?? [] };
}

export async function chooseMutation(db: Executor, character: CharacterRow, now: Date, id: string) {
  let row = await prepare(db, character.id, now);
  if (!row.mutationOffer?.includes(id)) forbid('Tej mutacji nie ma w ofercie');
  const world = await loadWorld(db, character.id);
  const threshold = nextMutationThreshold(world.contamination, row.chosenThresholds);
  row = {
    ...row,
    mutations: [...row.mutations, id],
    mutationOffer: null,
    chosenThresholds:
      threshold === null ? row.chosenThresholds : [...row.chosenThresholds, threshold],
  };
  row = syncOffer(row, world.contamination, now);
  await save(db, row);
  return { mutations: row.mutations, offer: row.mutationOffer ?? [] };
}

export async function wearCursed(db: Executor, character: CharacterRow, now: Date, worn: boolean) {
  const row = await prepare(db, character.id, now);
  await save(db, { ...row, cursed: worn });
  return { cursed: worn };
}

export async function startRitual(
  db: Executor,
  character: CharacterRow,
  now: Date,
  ritualId: string,
  domain = 1,
) {
  const ritual = findRitual(ritualId);
  if (!ritual) forbid('Nie ma takiego rytuału');
  const row = await prepare(db, character.id, now);
  if (!built(row, now)) forbid('Rytuał chce Piwnicy, a dom jeszcze nie stoi');
  if (cellarLevel(row) < 1) forbid('Najpierw Piwnica Rytualna');
  if (row.ritualId) forbid('Krąg jest zajęty');
  const lore = await loadLore(db, character.id, true);
  if (lore.knowledge < ritual.knowledge) forbid('Za mało Wiedzy Zakazanej');
  if (ritual.tome && !lore.booksRead.includes(ritual.tome)) forbid('Najpierw przeczytaj tom');
  if (row.candles < ritual.candles) forbid('Za mało świec rytuału');
  const portal = await loadPortal(db, character.id, true);
  if ((ritual.ichor ?? 0) > portal.ichor) forbid('Za mało Ichoru');
  if ((ritual.shards ?? 0) > portal.sigilShards) forbid('Za mało Odprysków Sigilu');
  const resources = materializeAll(
    await loadResources(db, character.id, { forUpdate: true }),
    resourceContext(character.level, lore.knowledge),
    now,
  );
  const maxSanity = resourceMax('sanity', resourceContext(character.level, lore.knowledge));
  const spent = spendResource('sanity', resources.sanity, now.getTime(), maxSanity, ritual.sanity);
  if (!spent) forbid('Za mało Poczytalności');
  await saveResources(db, character.id, { ...resources, sanity: spent });
  if (ritual.candles > 0 || (ritual.ichor ?? 0) > 0 || (ritual.shards ?? 0) > 0) {
    await savePortal(db, {
      ...portal,
      ichor: portal.ichor - (ritual.ichor ?? 0),
      sigilShards: portal.sigilShards - (ritual.shards ?? 0),
    });
  }
  const seed = `${domain}:${randomBytes(16).toString('base64url')}`;
  const ends = new Date(now.getTime() + ritual.ms);
  await save(db, {
    ...row,
    candles: row.candles - ritual.candles,
    ritualId: ritual.id,
    ritualEndsAt: ends,
    ritualSeed: seed,
  });
  return { ritualId: ritual.id, endsAt: ends.toISOString() };
}

export async function resolveRitual(db: Executor, character: CharacterRow, now: Date) {
  let row = await prepare(db, character.id, now);
  if (!row.ritualId || !row.ritualEndsAt || !row.ritualSeed) forbid('Krąg jest pusty');
  const ritualSeed = row.ritualSeed;
  if (row.ritualEndsAt > now)
    throw new AppError(409, ERROR_CODES.activityNotReady, 'Rytuał jeszcze trwa');
  const ritual = findRitual(row.ritualId);
  if (!ritual) forbid('Rytuał zniknął z księgi');
  const lore = await loadLore(db, character.id, true);
  const resources = materializeAll(
    await loadResources(db, character.id),
    resourceContext(character.level, lore.knowledge),
    now,
  );
  const maxSanity = resourceMax('sanity', resourceContext(character.level, lore.knowledge));
  const chance = ritualChance(
    lore.knowledge,
    ritual.knowledge,
    cellarLevel(row),
    resources.sanity.value,
    maxSanity,
  );
  const rng = createRng(ritualSeed);
  const outcome = rollRitual(rng, chance);
  const domain = Number(ritualSeed.split(':')[0] ?? 1) || 1;
  let reveal: { question: 'who'; index: number } | null = null;
  if (outcome === 'success' || outcome === 'priced') {
    row = await applyRitualSuccess(db, row, character, now, ritual.id, domain, rng, outcome);
    if (ritual.id === 'divination.case' && lore.caseStatus === 'open' && lore.caseSeed) {
      reveal = { question: 'who', index: generateCase(lore.caseSeed).solution.who };
    }
  }
  if (outcome === 'priced') row = await gainTenths(db, row, 20, now);
  if (outcome === 'disaster') {
    row = await gainTenths(db, row, 50, now);
    row = addWound(row, now, `${ritualSeed}:rana`, 4);
    await disasterFight(db, character, ritualSeed);
  }
  await save(db, { ...row, ritualId: null, ritualEndsAt: null, ritualSeed: null });
  return { outcome, hideout: row.hideout, reveal };
}

async function applyRitualSuccess(
  db: Executor,
  row: HearthStateRow,
  character: CharacterRow,
  now: Date,
  ritualId: string,
  domain: number,
  rng: ReturnType<typeof createRng>,
  outcome: RitualOutcome,
): Promise<HearthStateRow> {
  if (ritualId === 'protective.salt') {
    return { ...row, buffUntil: new Date(now.getTime() + SALT_BUFF_MS) };
  }
  if (ritualId === 'transmutation.essence') {
    const materials = { ...row.materials, essence: (row.materials.essence ?? 0) + 1 };
    return { ...row, materials };
  }
  if (ritualId === 'cleansing.wash') return gainTenths(db, row, -100, now);
  if (ritualId === 'opening.hideout' && (outcome === 'success' || outcome === 'priced')) {
    return { ...row, hideout: true };
  }
  if (ritualId === 'opening.seal') {
    const portal = await loadPortal(db, character.id, true);
    const gained = sealSigilCount(rng.rollBp(2_000));
    const key = String(domain);
    await savePortal(db, {
      ...portal,
      sigils: { ...portal.sigils, [key]: (portal.sigils[key] ?? 0) + gained },
    });
  }
  if (ritualId === 'summoning.directed') {
    const portal = await loadPortal(db, character.id, true);
    const prev = portal.echoes[DIRECTED_ECHO] ?? { shards: 0, level: 0 };
    await savePortal(db, {
      ...portal,
      echoes: { ...portal.echoes, [DIRECTED_ECHO]: { ...prev, shards: prev.shards + 1 } },
    });
  }
  return row;
}

function addWound(row: HearthStateRow, now: Date, seed: string, dread: number): HearthStateRow {
  const wound = rollWound(createRng(seed), dread);
  if (!wound) return row;
  const active = row.wounds.filter((entry) => Date.parse(entry.until) > now.getTime());
  if (active.length >= 3) return { ...row, wounds: active };
  active.push({
    id: wound.id,
    until: new Date(now.getTime() + wound.hours * HOUR_MS).toISOString(),
  });
  return { ...row, wounds: active };
}

async function disasterFight(db: Executor, character: CharacterRow, seed: string) {
  const [stats] = await db
    .select()
    .from(characterStats)
    .where(eq(characterStats.characterId, character.id))
    .limit(1);
  if (!stats) return;
  const result = simulateCombat(
    {
      level: character.level,
      stats: {
        strength: statUnits(stats.strength),
        defense: statUnits(stats.defense),
        accuracy: statUnits(stats.accuracy),
        evasion: statUnits(stats.evasion),
      },
      life: 100,
      maxLife: 100,
      sanity: 50,
      maxSanity: 100,
      classId: null,
      weaponDamage: 8,
      knowledge: 0,
    },
    {
      stats: { strength: 30, defense: 30, accuracy: 30, evasion: 30 },
      life: 80,
      damage: 8,
      dread: 3,
      gaze: false,
    },
    `${seed}:rzecz`,
  );
  if (result.winner === 'player') {
    await paySilver(db, character.id, 40, 'ritual.disaster', `disaster:${seed}`);
  }
}

export async function enterHideout(db: Executor, character: CharacterRow, now: Date) {
  const row = await prepare(db, character.id, now);
  if (!row.hideout) forbid('Kryjówka jest zamknięta');
  if (row.hideoutLooted) forbid('Kryjówka jest już pusta');
  await paySilver(db, character.id, HIDEOUT_SILVER, 'hideout', `hideout:${character.id}`);
  await save(db, { ...row, hideoutLooted: true });
  return { silver: HIDEOUT_SILVER };
}

export async function holdsTome(
  db: Executor,
  characterId: string,
  tomeId: string,
): Promise<boolean> {
  const row = await ensure(db, characterId, false);
  return row.shelf.includes(tomeId);
}

export async function grantSolvedCase(db: Executor, characterId: string): Promise<void> {
  const row = await ensure(db, characterId, true);
  if (row.shelf.includes(OPENING_TOME)) return;
  await save(db, {
    ...row,
    shelf: [...row.shelf, OPENING_TOME],
    candles: row.candles + CASE_RITUAL_CANDLES,
  });
}

export async function orderErrandBlocked(
  db: Executor,
  characterId: string,
  now: Date,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(hearthStates)
    .where(eq(hearthStates.characterId, characterId))
    .limit(1);
  return Boolean(row?.unmaskedUntil && row.unmaskedUntil > now);
}

export async function saltThresholdActive(
  db: Executor,
  characterId: string,
  now: Date,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(hearthStates)
    .where(eq(hearthStates.characterId, characterId))
    .limit(1);
  return Boolean(row?.buffUntil && row.buffUntil > now);
}

export interface PortalHearthMods {
  edge: number;
  strength: number;
  defense: number;
  accuracy: number;
  evasion: number;
  composure: number;
  materialFactor: number;
  tenths: number;
  suspicion: number;
}

export async function portalHearthMods(
  db: Executor,
  characterId: string,
  domain: number,
  now: Date,
): Promise<PortalHearthMods> {
  const row = applyPending(await ensure(db, characterId, true), now);
  await save(db, row);
  const aspect = domainAspect(domain);
  const sleeper = row.sleeper ? findSleeper(row.sleeper) : undefined;
  const wrath = Boolean(row.wrathUntil && row.wrathUntil > now);
  const bonus = circleBonus(row.circle);
  let edge = sleeper && aspect ? aspectEdge(sleeper.aspect, aspect) : 1;
  if (sleeper?.aspect === 'void') edge *= 1 + bonus;
  const factor = wrath ? WRATH_STAT_FACTOR : 1;
  let strength = factor;
  let defense = factor;
  let evasion = factor;
  if (sleeper?.aspect === 'flame') strength *= 1 + bonus;
  if (sleeper?.aspect === 'bone') defense *= 1 + bonus;
  if (sleeper?.aspect === 'gale') evasion *= 1 + bonus;
  let materialFactor = 1;
  if (sleeper && aspect && sleeper.aspect === aspect) materialFactor *= 1 + row.circle * 0.01;
  let suspicion = 0;
  if (row.cultSleeper) {
    const cult = findSleeper(row.cultSleeper);
    if (cult && aspect && cult.aspect === aspect) {
      materialFactor *= CULT_MATERIAL_FACTOR;
      suspicion = 1;
    }
  }
  return {
    edge,
    strength,
    defense,
    accuracy: factor,
    evasion,
    composure: sleeper?.aspect === 'pale' ? row.circle : 0,
    materialFactor,
    tenths: domainContaminationTenths(domain) + (row.cursed ? 1 : 0),
    suspicion,
  };
}

export async function commitPortalHearth(
  db: Executor,
  characterId: string,
  now: Date,
  tenths: number,
  suspicion: number,
): Promise<void> {
  if (tenths === 0 && suspicion === 0) return;
  let row = await ensure(db, characterId, true);
  if (suspicion > 0) {
    row = { ...row, suspicion: Math.min(SUSPICION_MAX, row.suspicion + suspicion) };
    if (row.suspicion >= SUSPICION_MAX) row = await unmask(db, row, now);
  }
  if (tenths !== 0) row = await gainTenths(db, row, tenths, now);
  await save(db, row);
}

export async function applyDefeatWound(
  db: Executor,
  characterId: string,
  now: Date,
  dread: number,
  seed: string,
): Promise<void> {
  const row = addWound(await ensure(db, characterId, true), now, seed, dread);
  await save(db, row);
}

export const roomIds = ROOMS;
