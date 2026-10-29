/**
 * Podróż, ogród, połów i usługi czterech miast (GDD 11, Etap 4).
 * Zegar pochodzi z serwera. Minigra połowu nie ufa czasom z klienta.
 */
import { randomBytes } from 'node:crypto';

import {
  BASKET_CAP,
  CITIES,
  CITY_NAMES,
  CLINIC_MS,
  CLINIC_SANITY,
  ERROR_CODES,
  GARDEN_LEVEL,
  MOUNT_IDS,
  MOUNTS,
  PLANT_EXPERIENCE,
  PURIFY_AMOUNT,
  PURIFY_SILVER,
  SEAL_DAILY_CAP,
  SEAL_LIFE_BP,
  WATER_EXPERIENCE,
  adjustResource,
  ambushChanceBp,
  clinicSilver,
  findCrop,
  fisheryFor,
  grantExperience,
  isWolfHour,
  planCast,
  plotPhase,
  resourceMax,
  rollAmbush,
  sealSilver,
  spendResource,
  tideAt,
  travelDurationMs,
  travelInProgress,
  utcDay,
  verifyReel,
  weatherAt,
  type AmbushKind,
  type CityId,
  type MountId,
  type ReelInput,
} from '@game/shared';
import { and, eq } from 'drizzle-orm';

import { writeAudit, type AuditActor } from '../audit.js';
import type { Clock } from '../clock.js';
import type { Executor } from '../db/client.js';
import {
  characters,
  itemInstances,
  timedActivities,
  type CharacterRow,
  type WorldStateRow,
} from '../db/schema.js';
import { AppError } from '../errors.js';
import { lockCharacter } from './activities.js';
import { assertCanAct, enterSanatorium } from './avatar.js';
import { loadLore } from './lore-state.js';
import { loadPortal, materializePortal, savePortal } from './portal-state.js';
import { loadResources, materializeAll, resourceContext, saveResources } from './resources.js';
import { InsufficientFundsError, postLedgerEntry } from './wallet.js';
import { loadWorld, saveWorld } from './world-state.js';

const audit = (
  db: Executor,
  who: AuditActor,
  characterId: string,
  action: string,
  after: unknown,
) => writeAudit(db, who, { action, characterId, after });

function asCity(value: string): CityId {
  return (CITIES as readonly string[]).includes(value) ? (value as CityId) : 'salt';
}

function mountOf(row: WorldStateRow, now: Date): MountId | null {
  if (!row.mountId || !row.mountUntil || row.mountUntil <= now) return null;
  return (MOUNT_IDS as readonly string[]).includes(row.mountId) ? (row.mountId as MountId) : null;
}

function weekKey(now: Date): string {
  const day = now.getUTCDay() || 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

async function ready(db: Executor, character: CharacterRow, now: Date) {
  const locked = await lockCharacter(db, character.id);
  await assertCanAct(db, locked, now);
  let world = await loadWorld(db, locked.id, true);
  world = await resolveArrival(db, locked, world, now);
  const lore = await loadLore(db, locked.id, true);
  const ctx = resourceContext(locked.level, lore.knowledge, 0);
  const resources = materializeAll(
    await loadResources(db, locked.id, { forUpdate: true }),
    ctx,
    now,
  );
  return { locked, world, lore, ctx, resources };
}

async function busyMission(db: Executor, characterId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: timedActivities.id })
    .from(timedActivities)
    .where(and(eq(timedActivities.characterId, characterId), eq(timedActivities.status, 'active')))
    .limit(1);
  return Boolean(row);
}

function assertStill(world: WorldStateRow, now: Date): void {
  if (travelInProgress(world.travelTo, world.travelEndsAt?.getTime() ?? null, now.getTime())) {
    throw new AppError(409, ERROR_CODES.activityBusy, 'Jesteś w drodze');
  }
}

function withReputation(world: WorldStateRow, city: CityId, delta = 1): WorldStateRow {
  return {
    ...world,
    cityReputation: {
      ...world.cityReputation,
      [city]: (world.cityReputation[city] ?? 0) + delta,
    },
  };
}

async function paySilver(
  db: Executor,
  characterId: string,
  amount: number,
  reason: string,
  key: string,
) {
  try {
    await postLedgerEntry(db, {
      characterId,
      currency: 'silver',
      delta: -amount,
      reason,
      idempotencyKey: key,
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało srebra');
    }
    throw error;
  }
}

async function resolveArrival(
  db: Executor,
  character: CharacterRow,
  row: WorldStateRow,
  now: Date,
): Promise<WorldStateRow> {
  if (!row.travelTo || !row.travelEndsAt || row.travelEndsAt > now) return row;
  const destination = asCity(row.travelTo);
  let resources = materializeAll(
    await loadResources(db, character.id, { forUpdate: true }),
    resourceContext(character.level, 0, 0),
    now,
  );
  const ambush = row.travelAmbush as AmbushKind | null;
  let basket = row.basket;
  let crate = row.crate;
  if (ambush === 'fight') {
    const loss = Math.min(10, Math.max(0, resources.life.value - 1));
    if (loss > 0) {
      const spent = spendResource(
        'life',
        resources.life,
        now.getTime(),
        resourceMax('life', resourceContext(character.level, 0, 0)),
        loss,
      );
      if (spent) resources = { ...resources, life: spent };
    }
  }
  if (ambush === 'toll') {
    resources = {
      ...resources,
      sanity: adjustResource(
        'sanity',
        resources.sanity,
        now.getTime(),
        resourceMax('sanity', resourceContext(character.level, 0, 0)),
        -2,
      ),
    };
  }
  if (ambush === 'cargo' && basket.length > 0) basket = basket.slice(0, -1);
  if (ambush === 'fight' && crate.length > 0) {
    const last = crate[crate.length - 1];
    crate =
      last && last.qty > 1
        ? [...crate.slice(0, -1), { ...last, qty: last.qty - 1 }]
        : crate.slice(0, -1);
  }
  if (resources.sanity.value <= 0) await enterSanatorium(db, character, resources, now);
  else await saveResources(db, character.id, resources);
  const next: WorldStateRow = {
    ...row,
    city: destination,
    travelTo: null,
    travelEndsAt: null,
    travelAmbush: null,
    basket,
    crate,
  };
  await saveWorld(db, next);
  return next;
}

export async function worldOf(db: Executor, character: CharacterRow, clock: Clock) {
  const now = clock.now();
  const locked = await lockCharacter(db, character.id);
  const world = await resolveArrival(db, locked, await loadWorld(db, locked.id, true), now);
  const at = now.getTime();
  const mount = mountOf(world, now);
  return {
    city: asCity(world.city),
    cityName: CITY_NAMES[asCity(world.city)],
    traveling: travelInProgress(world.travelTo, world.travelEndsAt?.getTime() ?? null, at),
    travelTo: world.travelTo,
    arrivesAt: world.travelEndsAt?.toISOString() ?? null,
    weather: weatherAt(at),
    wolfHour: isWolfHour(at),
    tide: tideAt(at),
    mount,
    mountUntil: world.mountUntil?.toISOString() ?? null,
    contamination: world.contamination,
    plots: world.plots.map((plot, index) => ({ index, ...plot, phase: plotPhase(plot, at) })),
    seeds: world.seeds,
    pantry: world.pantry,
    hooks: world.hooks,
    basket: world.basket,
    journal: world.journal,
    cast: world.castSeed ? { seed: world.castSeed, at: world.castAt?.toISOString() ?? null } : null,
    residents: world.residents,
    cityReputation: world.cityReputation,
    clinicEndsAt: world.clinicEndsAt?.toISOString() ?? null,
    home: worldHomeFrom(world, now),
  };
}

export function worldHomeFrom(row: WorldStateRow, now: Date) {
  const at = now.getTime();
  return {
    city: asCity(row.city),
    cityName: CITY_NAMES[asCity(row.city)],
    traveling: travelInProgress(row.travelTo, row.travelEndsAt?.getTime() ?? null, at),
    travelTo: row.travelTo,
    weather: weatherAt(at),
    wolfHour: isWolfHour(at),
    tide: tideAt(at),
    thirsty: row.plots.filter((plot) => plotPhase(plot, at) === 'thirsty').length,
  };
}

export async function depart(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  city: CityId,
) {
  const now = clock.now();
  const { locked, world, lore, resources } = await ready(db, character, now);
  assertStill(world, now);
  if (await busyMission(db, locked.id)) {
    throw new AppError(409, ERROR_CODES.activityBusy, 'Najpierw skończ zlecenie');
  }
  if (world.castSeed) throw new AppError(409, ERROR_CODES.activityBusy, 'Wędka jest w wodzie');
  const from = asCity(world.city);
  const weather = weatherAt(now.getTime());
  const mount = mountOf(world, now);
  const duration = travelDurationMs(from, city, weather, mount);
  if (duration === null) throw new AppError(409, ERROR_CODES.requirement, 'Już tu jesteś');
  const seed = randomBytes(16).toString('base64url');
  const ambush = rollAmbush(seed, ambushChanceBp(isWolfHour(now.getTime()), lore.stealth));
  if (mount === 'faceless') {
    const nextResources = {
      ...resources,
      sanity: adjustResource(
        'sanity',
        resources.sanity,
        now.getTime(),
        resourceMax('sanity', resourceContext(locked.level, lore.knowledge, 0)),
        -MOUNTS.faceless.sanity,
      ),
    };
    if (nextResources.sanity.value <= 0) {
      await enterSanatorium(db, locked, nextResources, now);
    } else await saveResources(db, locked.id, nextResources);
  }
  const next: WorldStateRow = {
    ...world,
    travelTo: city,
    travelEndsAt: new Date(now.getTime() + duration),
    travelAmbush: ambush,
  };
  await saveWorld(db, next);
  await audit(db, who, locked.id, 'travel.start', { from, city, ambush });
  return { arrivesAt: next.travelEndsAt?.toISOString(), ambush: ambush !== null };
}

async function grant(db: Executor, character: CharacterRow, amount: number) {
  const progress = grantExperience(character, amount);
  await db
    .update(characters)
    .set({ level: progress.level, experience: progress.experience })
    .where(eq(characters.id, character.id));
}

export async function rentMount(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  mountId: MountId,
  days: number,
) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  assertStill(world, now);
  if (asCity(world.city) !== 'mire') {
    throw new AppError(409, ERROR_CODES.requirement, 'Wierzchowce wynajmuje się w Mgławcu');
  }
  const mount = MOUNTS[mountId];
  if (locked.level < mount.minLevel) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ten wierzchowiec jest na późniejszą grę');
  }
  if (days < 1 || days > 7)
    throw new AppError(409, ERROR_CODES.requirement, 'Wynajem trwa 1–7 dni');
  await paySilver(
    db,
    locked.id,
    mount.silverPerDay * days,
    'mount.rent',
    `mount:${locked.id}:${now.toISOString()}`,
  );
  const next = withReputation(
    {
      ...world,
      mountId,
      mountUntil: new Date(now.getTime() + days * 24 * 60 * 60_000),
    },
    'mire',
  );
  await saveWorld(db, next);
  await audit(db, who, locked.id, 'mount.rent', { mountId, days });
  return { mountId, until: next.mountUntil?.toISOString() };
}

export async function plantCrop(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  plotIndex: number,
  cropId: string,
) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  assertStill(world, now);
  if (locked.level < GARDEN_LEVEL) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ogród otwiera się na 8. poziomie');
  }
  const crop = findCrop(cropId);
  const plot = world.plots[plotIndex];
  if (!crop || !plot) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej grządki');
  if (plotPhase(plot, now.getTime()) !== 'empty') {
    throw new AppError(409, ERROR_CODES.requirement, 'Grządka nie jest pusta');
  }
  const have = world.seeds[crop.id] ?? 0;
  if (have < 1) throw new AppError(409, ERROR_CODES.requirement, 'Brak nasion');
  if (crop.fertilizer) {
    const portal = await loadPortal(db, locked.id, true);
    const ash = portal.materials[crop.fertilizer] ?? 0;
    if (ash < 1) throw new AppError(409, ERROR_CODES.requirement, 'Potrzeba Popiołu Koloru');
    await savePortal(db, {
      ...portal,
      materials: { ...portal.materials, [crop.fertilizer]: ash - 1 },
    });
  }
  const plots = world.plots.map((entry, index) =>
    index === plotIndex ? { cropId: crop.id, plantedAt: now.getTime(), wateredAt: null } : entry,
  );
  await saveWorld(db, {
    ...withReputation(
      { ...world, plots, seeds: { ...world.seeds, [crop.id]: have - 1 } },
      asCity(world.city),
    ),
  });
  await grant(db, locked, PLANT_EXPERIENCE);
  await audit(db, who, locked.id, 'garden.plant', { cropId });
  return { plot: plotIndex, phase: 'growing' as const };
}

export async function waterCrop(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  plotIndex: number,
) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  assertStill(world, now);
  const plot = world.plots[plotIndex];
  if (!plot) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej grządki');
  if (plotPhase(plot, now.getTime()) !== 'thirsty') {
    throw new AppError(409, ERROR_CODES.requirement, 'Ta roślina nie czeka na wodę');
  }
  const plots = world.plots.map((entry, index) =>
    index === plotIndex ? { ...entry, wateredAt: now.getTime() } : entry,
  );
  await saveWorld(db, { ...world, plots });
  await grant(db, locked, WATER_EXPERIENCE);
  await audit(db, who, locked.id, 'garden.water', { plotIndex });
  return { plot: plotIndex, phase: 'ripening' as const };
}

export async function harvestCrop(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  plotIndex: number,
) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  assertStill(world, now);
  const plot = world.plots[plotIndex];
  if (!plot?.cropId) throw new AppError(404, ERROR_CODES.notFound, 'Grządka jest pusta');
  if (plotPhase(plot, now.getTime()) !== 'ready') {
    throw new AppError(409, ERROR_CODES.requirement, 'Jeszcze nie czas zbioru');
  }
  const crop = findCrop(plot.cropId);
  if (!crop) throw new AppError(404, ERROR_CODES.notFound, 'Nieznana uprawa');
  const plots = world.plots.map((entry, index) => (index === plotIndex ? emptyStored() : entry));
  const next = withReputation(
    {
      ...world,
      plots,
      pantry: { ...world.pantry, [crop.id]: (world.pantry[crop.id] ?? 0) + 1 },
      contamination: world.contamination + crop.contamination,
    },
    asCity(world.city),
  );
  await saveWorld(db, next);
  await grant(db, locked, crop.harvestXp);
  await audit(db, who, locked.id, 'garden.harvest', { cropId: crop.id });
  return { cropId: crop.id, contamination: next.contamination };
}

export async function clearPlot(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  plotIndex: number,
) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  const plot = world.plots[plotIndex];
  if (!plot) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej grządki');
  const plots = world.plots.map((entry, index) => (index === plotIndex ? emptyStored() : entry));
  await saveWorld(db, { ...world, plots });
  await audit(db, who, locked.id, 'garden.clear', { plotIndex });
  return { plot: plotIndex, phase: 'empty' as const };
}

function emptyStored() {
  return { cropId: null, plantedAt: null, wateredAt: null };
}

export async function castLine(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  const state = await ready(db, character, now);
  const { locked, world, ctx } = state;
  let { resources } = state;
  assertStill(world, now);
  if (world.castSeed) throw new AppError(409, ERROR_CODES.activityBusy, 'Wędka jest już w wodzie');
  if (!fisheryFor(asCity(world.city))) {
    throw new AppError(409, ERROR_CODES.requirement, 'Tu nie ma łowiska');
  }
  if (world.hooks < 1) throw new AppError(409, ERROR_CODES.requirement, 'Skończyły się haczyki');
  const spent = spendResource('toil', resources.toil, now.getTime(), resourceMax('toil', ctx), 1);
  if (!spent) throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Znoju');
  resources = { ...resources, toil: spent };
  await saveResources(db, locked.id, resources);
  const seed = randomBytes(16).toString('base64url');
  const plan = planCast(seed);
  await saveWorld(db, {
    ...world,
    hooks: world.hooks - 1,
    castSeed: seed,
    castAt: now,
  });
  await audit(db, who, locked.id, 'fishing.cast', {});
  return {
    seed,
    biteAtMs: plan.biteAtMs,
    windowMs: plan.windowMs,
    pulls: plan.pulls.length,
  };
}

export async function reelLine(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  input: ReelInput,
) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  if (!world.castSeed || !world.castAt) {
    throw new AppError(409, ERROR_CODES.requirement, 'Najpierw rzuć wędkę');
  }
  const elapsed = now.getTime() - world.castAt.getTime();
  if (input.reactionOffsetMs > elapsed + 150) {
    throw new AppError(409, ERROR_CODES.requirement, 'Hol jest z przyszłości');
  }
  const plan = planCast(world.castSeed);
  const verdict = verifyReel(plan, input);
  const fishery = fisheryFor(asCity(world.city));
  const species = fishery?.fish[plan.speciesIndex] ?? 'Ryba';
  const legendKey = `${fishery?.id ?? 'none'}:${weekKey(now)}`;
  const legend =
    verdict.caught && !plan.oddity && plan.weight >= 3500 && !world.legends.includes(legendKey);
  const fish = {
    species: legend ? `Legenda: ${species}` : species,
    weight: plan.weight,
    oddity: plan.oddity,
    fishery: fishery?.id ?? 'none',
    at: now.toISOString(),
  };
  let basket = world.basket;
  if (verdict.caught && basket.length < BASKET_CAP) basket = [...basket, fish];
  const journal = [
    ...world.journal,
    { ...fish, species: verdict.caught ? fish.species : 'Spłoszona' },
  ].slice(-20);
  await saveWorld(db, {
    ...world,
    castSeed: null,
    castAt: null,
    basket,
    journal,
    legends: legend ? [...world.legends, legendKey] : world.legends,
  });
  await audit(db, who, locked.id, 'fishing.reel', { ...verdict, legend });
  return { ...verdict, legend, species: verdict.caught ? fish.species : null, weight: plan.weight };
}

const BRAND_MATERIALS = ['ib-stone', 'deep-scale', 'colour-ash', 'vein-blood'] as const;

export async function brandItem(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  itemId: string,
  materialId: string,
) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  assertStill(world, now);
  if (!(BRAND_MATERIALS as readonly string[]).includes(materialId)) {
    throw new AppError(409, ERROR_CODES.requirement, 'To nie jest materiał Domeny');
  }
  const [item] = await db
    .select()
    .from(itemInstances)
    .where(and(eq(itemInstances.id, itemId), eq(itemInstances.characterId, locked.id)))
    .limit(1);
  if (!item) throw new AppError(404, ERROR_CODES.notFound, 'Nie masz tego przedmiotu');
  if (item.rarity !== 'occult' && item.rarity !== 'cursed') {
    throw new AppError(
      409,
      ERROR_CODES.requirement,
      'Piętno przyjmuje tylko Okultystyczny lub Przeklęty',
    );
  }
  const portal = materializePortal(await loadPortal(db, locked.id, true), now);
  const have = portal.materials[materialId] ?? 0;
  if (have < 1) throw new AppError(409, ERROR_CODES.requirement, 'Brak materiału Domeny');
  await savePortal(db, {
    ...portal,
    materials: { ...portal.materials, [materialId]: have - 1 },
  });
  await saveWorld(db, { ...world, itemBrands: { ...world.itemBrands, [item.id]: materialId } });
  await audit(db, who, locked.id, 'forge.brand', { itemId, materialId });
  return { itemId, materialId };
}

export async function sealItem(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  itemId: string,
) {
  const now = clock.now();
  const state = await ready(db, character, now);
  const { locked, world, ctx } = state;
  let { resources } = state;
  assertStill(world, now);
  if (asCity(world.city) !== 'ilmar') {
    throw new AppError(409, ERROR_CODES.requirement, 'Pieczętowanie Krwią jest w Ilmarze');
  }
  const day = utcDay(now.getTime());
  const used = world.sealDay === day ? world.sealCount : 0;
  if (used >= SEAL_DAILY_CAP) {
    throw new AppError(409, ERROR_CODES.requirement, 'Krew stygnie do północy');
  }
  if (world.sealedItems.includes(itemId)) {
    throw new AppError(409, ERROR_CODES.requirement, 'To imię już jest na przedmiocie');
  }
  const [item] = await db
    .select()
    .from(itemInstances)
    .where(and(eq(itemInstances.id, itemId), eq(itemInstances.characterId, locked.id)))
    .limit(1);
  if (!item) throw new AppError(404, ERROR_CODES.notFound, 'Nie masz tego przedmiotu');
  const cost = Math.max(1, Math.round((resourceMax('life', ctx) * SEAL_LIFE_BP) / 10_000));
  const spent = spendResource(
    'life',
    resources.life,
    now.getTime(),
    resourceMax('life', ctx),
    cost,
  );
  if (!spent)
    throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Życia na pieczęć');
  await paySilver(db, locked.id, sealSilver(locked.level), 'seal.blood', `seal:${item.id}`);
  resources = { ...resources, life: spent };
  await saveResources(db, locked.id, resources);
  await saveWorld(
    db,
    withReputation(
      {
        ...world,
        sealDay: day,
        sealCount: used + 1,
        sealedItems: [...world.sealedItems, item.id],
      },
      'ilmar',
    ),
  );
  await audit(db, who, locked.id, 'seal.blood', { itemId });
  return { itemId, life: spent.value };
}

export async function purify(db: Executor, who: AuditActor, character: CharacterRow, clock: Clock) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  assertStill(world, now);
  if (asCity(world.city) !== 'brink') {
    throw new AppError(409, ERROR_CODES.requirement, 'Oczyszczenie jest w Kresie');
  }
  if (world.contamination < 1) {
    throw new AppError(409, ERROR_CODES.requirement, 'Nie ma czego oczyszczać');
  }
  await paySilver(
    db,
    locked.id,
    PURIFY_SILVER,
    'purify',
    `purify:${locked.id}:${now.toISOString()}`,
  );
  const contamination = Math.max(0, world.contamination - PURIFY_AMOUNT);
  await saveWorld(db, withReputation({ ...world, contamination }, 'brink'));
  await audit(db, who, locked.id, 'purify', { contamination });
  return { contamination };
}

export async function startClinic(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  assertStill(world, now);
  if (asCity(world.city) !== 'brink') {
    throw new AppError(409, ERROR_CODES.requirement, 'Sanatorium Wysokie jest w Kresie');
  }
  if (world.clinicEndsAt && world.clinicEndsAt > now) {
    throw new AppError(409, ERROR_CODES.activityBusy, 'Sesja już trwa');
  }
  await paySilver(
    db,
    locked.id,
    clinicSilver(locked.level),
    'clinic.high',
    `clinic:${locked.id}:${now.toISOString()}`,
  );
  const ends = new Date(now.getTime() + CLINIC_MS);
  await saveWorld(db, { ...world, clinicEndsAt: ends });
  await audit(db, who, locked.id, 'clinic.start', {});
  return { endsAt: ends.toISOString() };
}

export async function claimClinic(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  const state = await ready(db, character, now);
  const { locked, world, ctx } = state;
  let { resources } = state;
  if (!world.clinicEndsAt) throw new AppError(409, ERROR_CODES.requirement, 'Nie ma sesji');
  if (world.clinicEndsAt > now) {
    throw new AppError(409, ERROR_CODES.activityNotReady, 'Sesja jeszcze trwa');
  }
  const max = resourceMax('sanity', ctx);
  resources = {
    ...resources,
    sanity: adjustResource('sanity', resources.sanity, now.getTime(), max, CLINIC_SANITY),
  };
  if (resources.sanity.value > max) {
    resources = { ...resources, sanity: { value: max, updatedAt: now.getTime() } };
  }
  await saveResources(db, locked.id, resources);
  await saveWorld(db, withReputation({ ...world, clinicEndsAt: null }, 'brink'));
  await audit(db, who, locked.id, 'clinic.claim', {});
  return { sanity: resources.sanity.value };
}

export async function meetResident(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  residentId: string,
) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  assertStill(world, now);
  const city = asCity(world.city);
  const person = world.residents.find(
    (resident) => resident.city === city && resident.id === residentId && !resident.gone,
  );
  if (!person) throw new AppError(404, ERROR_CODES.notFound, 'Tego mieszkańca tu nie ma');
  const familiarity = person.familiarity + 1;
  const residents = world.residents.map((resident) =>
    resident.city === city && resident.id === residentId ? { ...resident, familiarity } : resident,
  );
  const next = withReputation({ ...world, residents }, city);
  await saveWorld(db, next);
  await audit(db, who, locked.id, 'resident.meet', { residentId, familiarity });
  return { residentId, familiarity, reputation: next.cityReputation[city] ?? familiarity };
}

export async function buySeed(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  cropId: string,
) {
  const now = clock.now();
  const { locked, world } = await ready(db, character, now);
  assertStill(world, now);
  if (asCity(world.city) !== 'mire') {
    throw new AppError(409, ERROR_CODES.requirement, 'Zielarka jest w Mgławcu');
  }
  const crop = findCrop(cropId);
  if (!crop || crop.silver <= 0)
    throw new AppError(404, ERROR_CODES.notFound, 'Tego nasiona nie sprzedaje');
  await paySilver(
    db,
    locked.id,
    crop.silver,
    'seed.buy',
    `seed:${locked.id}:${crop.id}:${now.toISOString()}`,
  );
  const have = world.seeds[crop.id] ?? 0;
  await saveWorld(
    db,
    withReputation({ ...world, seeds: { ...world.seeds, [crop.id]: have + 1 } }, 'mire'),
  );
  await audit(db, who, locked.id, 'seed.buy', { cropId });
  return { cropId, seeds: have + 1 };
}
