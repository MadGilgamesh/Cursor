/**
 * Portal Bogów, Studnia, Seans i Grawer (GDD 5.10, 5.12, 11 — Etap 2).
 * Walka w Portalu zużywa klucz, liczy nagrodę i zapisuje postęp w jednej transakcji.
 */
import { randomBytes } from 'node:crypto';

import {
  ERROR_CODES,
  awakeningMaterialBonus,
  WELL_GUARDIAN_KEYS,
  WELL_GUARDIAN_METEORS,
  WELL_MAX_FLOOR_THIS_STAGE,
  WELL_VIGOR_COST,
  WELL_WHISPERS,
  adjustResource,
  computeLoadout,
  createRng,
  dreamKeyCount,
  echoStatMultiplier,
  echoUpgradeCost,
  effectiveStatsCenti,
  KEY_REGEN_INTERVAL_MS,
  abyssMutatorBp,
  awakeningWeekStart,
  enemyDamage,
  enemyLevel,
  enemyLife,
  enemyStat,
  keyRegenIntervalMs,
  patronActive,
  wellEnemyDamage,
  wellEnemyLife,
  wellEnemyStat,
  engraverSilverCost,
  findEcho,
  fightExperience,
  fightSilver,
  godEchoForClear,
  isWellGuardian,
  nextPortalFight,
  edgeLootMultiplier,
  emptyStarTrack,
  panicImmune,
  portalAccess,
  portalAuraDread,
  portalDomain,
  portalSigilRequired,
  portalStarAccess,
  sanityTier,
  portalEnemyDamage,
  portalEnemyLife,
  portalEnemyStat,
  portalEquivalentFloor,
  portalFightIndex,
  portalModifier,
  portalPayout,
  portalRecommendedLevel,
  portalUnitName,
  resourceMax,
  rollSeanceFromSeed,
  seanceEchoesOf,
  simulateCombat,
  spendDreamKey,
  spendResource,
  statUnits,
  travelInProgress,
  utcDay,
  weaponDamage,
  wellContaminationTenths,
  wellFightDread,
  wellWhisperPending,
  composureWithClass,
  type PortalCoord,
  type WellWhisper,
  ENGRAVER_DAILY_CAP,
  ENGRAVER_METEOR_COST,
  ECHO_MAX_LEVEL,
  PORTAL_DOMAINS_THIS_STAGE,
  PORTAL_WIN_SHARD_CHANCE_BP,
  REFORGE_DAILY_CAP,
  REFORGE_KEYS,
  SEAL_DOUBLE_BP,
  SIGIL_SHARDS_PER_SIGIL,
  UNARMED_DAMAGE,
  sealSigilCount,
  reforgeIchorCost,
  unlockedPortalGods,
  addKeyShards,
  addLootKeys,
  beyondStarEcho,
  findGear,
  lootersLoss,
  outerAspect,
  pow125,
} from '@game/shared';
import { and, eq } from 'drizzle-orm';

import { writeAudit, type AuditActor } from '../audit.js';
import type { Clock } from '../clock.js';
import type { Executor } from '../db/client.js';
import { combatLogs, itemInstances, type CharacterRow, type PortalStateRow } from '../db/schema.js';
import { AppError } from '../errors.js';
import {
  assertCanAct,
  enterHospital,
  enterSanatorium,
  equippedOf,
  loadStats,
  resolveStatus,
  statBlock,
} from './avatar.js';
import { lockCharacter } from './activities.js';
import { noteClockAction, recordAbyssFloor } from './conjunction.js';
import { loreExtras, loadLore, recordPortalKill } from './lore-state.js';
import { materializeAll, resourceContext, saveResources } from './resources.js';
import { giveItem } from './stage1.js';
import {
  grantKeyShards,
  keyRegenFullAt,
  loadPortal,
  materializePortal,
  ringOf,
  savePortal,
  withRing,
} from './portal-state.js';
import { commitPortalHearth, portalHearthMods } from './hearth.js';
import { persistProgress } from './progress.js';
import { loadWorld } from './world-state.js';
import { postLedgerEntry, walletOf } from './wallet.js';
import { InsufficientFundsError } from './wallet.js';

const audit = (
  db: Executor,
  who: AuditActor,
  characterId: string,
  action: string,
  after: unknown,
) => writeAudit(db, who, { action, characterId, after });

function clearedOf(row: PortalStateRow) {
  return { domain: row.clearedDomain, stage: row.clearedStage, substage: row.clearedSubstage };
}

export function portalView(row: PortalStateRow, now: Date, intervalMs = KEY_REGEN_INTERVAL_MS) {
  const current = materializePortal(row, now, intervalMs);
  const ring = ringOf(current);
  const next = nextPortalFight(clearedOf(row));
  const domain = portalDomain(Math.min(next.domain, PORTAL_DOMAINS_THIS_STAGE));
  return {
    keys: {
      regen: ring.regenKeys,
      loot: ring.lootKeys,
      shards: ring.shards,
      total: dreamKeyCount(ring),
      fullAt: keyRegenFullAt(row, now, intervalMs),
    },
    cleared: clearedOf(row),
    next: {
      ...next,
      name: portalUnitName(next.domain, next.stage),
      place: domain?.place ?? '',
      modifier: domain?.modifierName ?? '',
      recommendedLevel: portalRecommendedLevel(next),
      open: next.domain <= PORTAL_DOMAINS_THIS_STAGE,
    },
    materials: row.materials,
    sigilShards: row.sigilShards,
    sigils: row.sigils,
    meteorShards: row.meteorShards,
    engraver: {
      used: row.engraverDay === utcDay(now.getTime()) ? row.engraverCount : 0,
      cap: ENGRAVER_DAILY_CAP,
    },
    well: {
      floor: row.wellFloor,
      max: WELL_MAX_FLOOR_THIS_STAGE,
      whisperPending: wellWhisperPending(row.wellFloor, row.whisperUntilFloor),
      whisper: row.whisperId,
    },
    candles: current.candles,
    altar: {
      reforgeLeft: Math.max(
        0,
        REFORGE_DAILY_CAP -
          (current.reforgeDay === utcDay(now.getTime()) ? current.reforgeCount : 0),
      ),
      ichor: current.ichor,
      bokrugSigils: current.sigils['1'] ?? 0,
      colourSigils: current.sigils['3'] ?? 0,
    },
    ectoplasm: current.ectoplasm,
    activeEchoId: row.activeEchoId,
    echoes: Object.entries(row.echoes).map(([id, progress]) => {
      const def = findEcho(id);
      return {
        id,
        name: def?.name ?? id,
        rarity: def?.rarity ?? 'whisper',
        shards: progress.shards,
        level: progress.level,
        active: row.activeEchoId === id,
      };
    }),
  };
}

export async function portalOf(db: Executor, character: CharacterRow, clock: Clock) {
  const now = clock.now();
  const patron = patronActive(character.patronUntil?.getTime() ?? null, now.getTime());
  return portalView(await loadPortal(db, character.id), now, keyRegenIntervalMs(patron));
}

export async function dreamCombatant(
  db: Executor,
  character: CharacterRow,
  row: PortalStateRow,
  now: Date,
) {
  const resources = await resolveStatus(db, character, now);
  const statsRow = await loadStats(db, character.id);
  const base = statBlock(statsRow);
  const equipped = await equippedOf(db, character.id);
  const lore = await loadLore(db, character.id);
  const journey = await loadWorld(db, character.id);
  const loadout = computeLoadout(equipped, journey.sealedItems);
  const effective = effectiveStatsCenti(base, loadout);
  const extras = loreExtras(lore);
  const patron = patronActive(character.patronUntil?.getTime() ?? null, now.getTime());
  const ctx = resourceContext(character.level, extras.knowledge, extras.sanityPenalty, patron);
  const current = materializeAll(resources, ctx, now);
  const echo = row.activeEchoId ? findEcho(row.activeEchoId) : undefined;
  const echoLevel = echo ? (row.echoes[echo.id]?.level ?? 0) : 0;
  const multiplier = echo && echoLevel > 0 ? echoStatMultiplier(echo.rarity, echoLevel) : 1;
  const weapon = loadout.weapon;
  const gear = weapon ? findGear(weapon.itemId) : undefined;
  return {
    ctx,
    resources: current,
    classId: loadout.classId,
    player: {
      level: character.level,
      stats: {
        strength: statUnits(effective.strength) * multiplier,
        defense: statUnits(effective.defense) * multiplier,
        accuracy: statUnits(effective.accuracy) * multiplier,
        evasion: statUnits(effective.evasion) * multiplier,
      },
      life: resourceMax('life', ctx),
      maxLife: resourceMax('life', ctx),
      sanity: current.sanity.value,
      maxSanity: resourceMax('sanity', ctx),
      classId: loadout.classId,
      weaponDamage:
        weapon && gear
          ? weaponDamage(gear.tier, weapon.qualityBp, weapon.enhancement, 0)
          : UNARMED_DAMAGE,
      knowledge: lore.knowledge,
      composure: composureWithClass(lore.composure, loadout.classId),
      panicImmune: panicImmune(lore.scars),
      contamination: journey.contamination,
      pulseBrand: loadout.weapon?.instanceId
        ? journey.itemBrands[loadout.weapon.instanceId] === 'vein-blood'
        : false,
    },
  };
}

function portalEnemy(coord: PortalCoord, stars = 0) {
  const floor = portalEquivalentFloor(portalFightIndex(coord));
  const role = coord.substage === 8 ? (coord.stage === 10 ? 'avatar' : 'boss') : 'minion';
  const stat = portalEnemyStat(floor, role, stars);
  return {
    stats: { strength: stat, defense: stat, accuracy: stat, evasion: stat },
    life: portalEnemyLife(floor, role, stars),
    damage: portalEnemyDamage(floor, role, stars),
    dread: portalAuraDread(coord.domain),
    gaze: false,
  };
}

function starTrackOf(row: PortalStateRow, domain: number) {
  return row.starTracks[String(domain)] ?? emptyStarTrack();
}

export async function fightPortal(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  coord: PortalCoord,
  stars = 0,
) {
  const now = clock.now();
  const locked = await lockCharacter(db, character.id);
  await assertCanAct(db, locked, now);
  const mods = await portalHearthMods(db, locked.id, coord.domain, now);
  const journey = await loadWorld(db, locked.id, true);
  if (travelInProgress(journey.travelTo, journey.travelEndsAt?.getTime() ?? null, now.getTime())) {
    throw new AppError(409, ERROR_CODES.activityBusy, 'W podróży Brama milczy');
  }
  const dream = clearedOf(await loadPortal(db, locked.id));
  const preview = await loadPortal(db, locked.id);
  const access =
    stars > 0
      ? portalStarAccess(coord, stars, dream, starTrackOf(preview, coord.domain))
      : portalAccess(coord, dream);
  if (access === 'locked') {
    throw new AppError(409, ERROR_CODES.requirement, 'Ta Domena jeszcze się nie otwiera');
  }
  if (access === 'skip') {
    throw new AppError(409, ERROR_CODES.requirement, 'Nie da się pominąć podetapu');
  }
  let row = materializePortal(await loadPortal(db, locked.id, true), now);
  const needsSigil = portalSigilRequired(coord, stars);
  if (needsSigil) {
    const key = String(coord.domain);
    const have = row.sigils[key] ?? 0;
    if (have < 1) throw new AppError(409, ERROR_CODES.noSigil, 'Potrzeba Sigilu tego boga');
    row = { ...row, sigils: { ...row.sigils, [key]: have - 1 } };
  } else {
    const spent = spendDreamKey(ringOf(row));
    if (!spent) throw new AppError(409, ERROR_CODES.noDreamKey, 'Nie masz Klucza Snu');
    row = withRing(row, spent, now);
  }

  const body = await dreamCombatant(db, locked, row, now);
  const seed = randomBytes(16).toString('base64url');
  const modifier = portalModifier(coord.domain) ?? undefined;
  const aspect = modifier ? outerAspect(modifier, coord.stage, seed) : null;
  const enemy = portalEnemy(coord, stars);
  const player = {
    ...body.player,
    stats: {
      strength: body.player.stats.strength * mods.strength,
      defense: body.player.stats.defense * mods.defense,
      accuracy: body.player.stats.accuracy * mods.accuracy,
      evasion: body.player.stats.evasion * mods.evasion,
    },
    composure: body.player.composure + mods.composure,
  };
  const result = simulateCombat(
    player,
    aspect ? { ...enemy, aspect } : enemy,
    seed,
    modifier,
    mods.edge,
  );
  const won = result.winner === 'player';
  const firstClear = access === 'first' && won;
  const payout = portalPayout(coord, firstClear, won, stars);
  const silver = Math.round(
    payout.silver * edgeLootMultiplier(sanityTier(body.player.sanity, body.player.maxSanity)),
  );
  const rng = createRng(seed);

  const shardsGained = needsSigil ? 0 : won ? (rng.rollBp(PORTAL_WIN_SHARD_CHANCE_BP) ? 1 : 0) : 1;
  if (shardsGained > 0) row = withRing(row, addKeyShards(ringOf(row), shardsGained), now);

  const materials = { ...row.materials };
  const materialBonus = awakeningMaterialBonus(now.getTime(), coord.domain, row.clearedDomain)
    ? 1.25
    : 1;
  const materialAmount = Math.round(payout.materials * materialBonus * mods.materialFactor);
  if (materialAmount > 0) {
    const materialId = portalDomain(coord.domain)?.materialId ?? 'unknown';
    materials[materialId] = (materials[materialId] ?? 0) + materialAmount;
  }
  const sigils = { ...row.sigils };
  if (won && (await recordPortalKill(db, locked.id, coord.domain, coord.stage))) {
    const key = String(coord.domain);
    sigils[key] = (sigils[key] ?? 0) + 1;
  }
  if (payout.nextGodSigils > 0) {
    const key = String(coord.domain + 1);
    sigils[key] = (sigils[key] ?? 0) + payout.nextGodSigils;
  }
  const echoes = { ...row.echoes };
  if (firstClear) {
    const godEcho = godEchoForClear(coord.domain, coord.stage, coord.substage);
    if (godEcho) {
      const prev = echoes[godEcho.id] ?? { shards: 0, level: 0 };
      echoes[godEcho.id] = { ...prev, shards: prev.shards + 1 };
    }
  }
  if (firstClear && stars === 0) {
    row = {
      ...row,
      clearedDomain: coord.domain,
      clearedStage: coord.stage,
      clearedSubstage: coord.substage,
    };
  }
  if (firstClear && stars > 0) {
    const finished = coord.stage === 10 && coord.substage === 8;
    if (finished && stars >= 3) {
      const beyond = beyondStarEcho(coord.domain);
      if (beyond) {
        const prev = echoes[beyond.id] ?? { shards: 0, level: 0 };
        echoes[beyond.id] = { ...prev, shards: prev.shards + 1 };
      }
    }
    const previous = starTrackOf(row, coord.domain);
    row = {
      ...row,
      starTracks: {
        ...row.starTracks,
        [String(coord.domain)]: finished
          ? { cleared: stars, stage: 0, substage: 0 }
          : { cleared: previous.cleared, stage: coord.stage, substage: coord.substage },
      },
    };
  }
  row = {
    ...row,
    materials,
    sigils,
    sigilShards: row.sigilShards + payout.sigilShards,
    echoes,
    meteorShards: row.meteorShards + (won && coord.domain === 3 ? 1 : 0),
  };
  await savePortal(db, row);

  await persistProgress(db, locked, payout.experience);
  if (silver > 0) {
    await postLedgerEntry(db, {
      characterId: locked.id,
      currency: 'silver',
      delta: silver,
      reason: 'portal.reward',
      refId: seed,
      idempotencyKey: `portal:${seed}:silver`,
    });
  }

  const sanityDelta = result.sanityEnd - result.sanityStart;
  let resources = body.resources;
  if (sanityDelta !== 0) {
    resources = {
      ...resources,
      sanity: adjustResource(
        'sanity',
        resources.sanity,
        now.getTime(),
        body.player.maxSanity,
        sanityDelta,
      ),
    };
    if (resources.sanity.value <= 0) {
      resources = await enterSanatorium(db, locked, resources, now);
    } else {
      await saveResources(db, locked.id, resources);
    }
  }

  await db.insert(combatLogs).values({
    characterId: locked.id,
    seed,
    enemyId: `portal.${coord.domain}.${coord.stage}.${coord.substage}`,
    floor: portalFightIndex(coord),
    winner: result.winner,
    log: result,
    engineVersion: result.engineVersion,
    balanceVersion: result.balanceVersion,
  });
  await commitPortalHearth(db, locked.id, now, mods.tenths, mods.suspicion);
  await audit(db, who, locked.id, 'portal.fight', {
    coord,
    won,
    firstClear,
    experience: payout.experience,
  });
  if (firstClear && stars === 0) await noteClockAction(db, locked.id, 'avatarFirst', now);
  if (firstClear && stars > 0) await noteClockAction(db, locked.id, 'avatarStar', now);

  return {
    result: { winner: result.winner, rounds: result.rounds, sanityEnd: result.sanityEnd },
    firstClear,
    experience: payout.experience,
    silver,
    materials: payout.materials,
    shardsGained,
    keys: portalView(row, now).keys,
    life: resources.life.value,
    status: resources.sanity.value <= 0 ? 'broken' : 'ok',
  };
}

export async function reforgeSigil(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  domain: number,
) {
  const now = clock.now();
  const locked = await lockCharacter(db, character.id);
  await assertCanAct(db, locked, now);
  const lore = await loadLore(db, locked.id, true);
  let row = materializePortal(await loadPortal(db, locked.id, true), now);
  if (!unlockedPortalGods(clearedOf(row)).includes(domain)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ten bóg nie jest jeszcze odblokowany');
  }
  const day = utcDay(now.getTime());
  const used = row.reforgeDay === day ? row.reforgeCount : 0;
  if (used >= REFORGE_DAILY_CAP) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ołtarz przyjmuje tylko pięć Przekuć na dobę');
  }
  const ichor = reforgeIchorCost(lore.knowledge);
  if (row.ichor < ichor) {
    throw new AppError(409, ERROR_CODES.requirement, 'Potrzeba Ichoru albo Wiedzy 20');
  }
  let ring = ringOf(row);
  for (let index = 0; index < REFORGE_KEYS; index += 1) {
    const spent = spendDreamKey(ring);
    if (!spent) throw new AppError(409, ERROR_CODES.noDreamKey, 'Przekucie bierze 3 Klucze Snu');
    ring = spent;
  }
  row = withRing(row, ring, now);
  const key = String(domain);
  row = {
    ...row,
    ichor: row.ichor - ichor,
    reforgeDay: day,
    reforgeCount: used + 1,
    sigils: { ...row.sigils, [key]: (row.sigils[key] ?? 0) + 1 },
  };
  await savePortal(db, row);
  await audit(db, who, locked.id, 'portal.reforge', { domain, ichor });
  return {
    domain,
    sigils: row.sigils[key] ?? 0,
    reforgeLeft: REFORGE_DAILY_CAP - used - 1,
    keys: portalView(row, now).keys,
  };
}

/** 10 Odprysków → 1 Sigil, 20% na drugi (Rytuał Pieczęci, GDD 6.5). */
export async function exchangeSigilShards(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  domain: number,
) {
  const now = clock.now();
  const locked = await lockCharacter(db, character.id);
  await assertCanAct(db, locked, now);
  const row = await loadPortal(db, locked.id, true);
  if (!unlockedPortalGods(clearedOf(row)).includes(domain)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ten bóg nie jest jeszcze odblokowany');
  }
  if (row.sigilShards < SIGIL_SHARDS_PER_SIGIL) {
    throw new AppError(409, ERROR_CODES.requirement, 'Potrzeba 10 Odprysków Sigilu');
  }
  const key = String(domain);
  const doubled = createRng(randomBytes(16).toString('base64url')).rollBp(SEAL_DOUBLE_BP);
  const gained = sealSigilCount(doubled);
  const next = {
    ...row,
    sigilShards: row.sigilShards - SIGIL_SHARDS_PER_SIGIL,
    sigils: { ...row.sigils, [key]: (row.sigils[key] ?? 0) + gained },
  };
  await savePortal(db, next);
  await audit(db, who, locked.id, 'portal.exchange', { domain, gained, doubled });
  return { domain, sigils: next.sigils[key] ?? 0, shards: next.sigilShards, doubled };
}

export async function engraveKey(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  await lockCharacter(db, character.id);
  await assertCanAct(db, character, now);
  let row = materializePortal(await loadPortal(db, character.id, true), now);
  const day = utcDay(now.getTime());
  const used = row.engraverDay === day ? row.engraverCount : 0;
  if (used >= ENGRAVER_DAILY_CAP) {
    throw new AppError(409, ERROR_CODES.requirement, 'Grawer odpoczywa do północy');
  }
  if (row.meteorShards < ENGRAVER_METEOR_COST) {
    throw new AppError(409, ERROR_CODES.requirement, 'Potrzeba 2 Odłamków Meteorytu');
  }
  const cost = engraverSilverCost(character.level);
  try {
    await postLedgerEntry(db, {
      characterId: character.id,
      currency: 'silver',
      delta: -cost,
      reason: 'portal.engrave',
      idempotencyKey: `engrave:${character.id}:${day}:${used + 1}`,
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało srebra na Grawer');
    }
    throw error;
  }
  row = withRing(row, addLootKeys(ringOf(row), 1), now);
  row = {
    ...row,
    meteorShards: row.meteorShards - ENGRAVER_METEOR_COST,
    engraverDay: day,
    engraverCount: used + 1,
  };
  await savePortal(db, row);
  await audit(db, who, character.id, 'portal.engrave', { cost });
  return { cost, keys: portalView(row, now).keys };
}

export async function chooseWhisper(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  whisper: WellWhisper,
) {
  const now = clock.now();
  await lockCharacter(db, character.id);
  const row = await loadPortal(db, character.id, true);
  if (!wellWhisperPending(row.wellFloor, row.whisperUntilFloor)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Studnia teraz milczy');
  }
  if (!WELL_WHISPERS.includes(whisper)) {
    throw new AppError(400, ERROR_CODES.validation, 'Nieznany Szept');
  }
  const next = {
    ...row,
    whisperId: whisper,
    whisperUntilFloor: row.wellFloor + 5,
  };
  await savePortal(db, next);
  await audit(db, who, character.id, 'well.whisper', { whisper });
  return portalView(next, now).well;
}

export async function fightWell(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  const locked = await lockCharacter(db, character.id);
  await assertCanAct(db, locked, now);
  let row = await loadPortal(db, locked.id, true);
  if (wellWhisperPending(row.wellFloor, row.whisperUntilFloor)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Najpierw wybierz Szept Studni');
  }
  const floor = row.wellFloor + 1;
  const whisper =
    row.whisperId && floor <= row.whisperUntilFloor && floor > row.whisperUntilFloor - 5
      ? (row.whisperId as WellWhisper)
      : null;
  const body = await dreamCombatant(db, locked, row, now);
  const vigorCost = whisper === 'tide' ? 5 : WELL_VIGOR_COST;
  const vigor = spendResource(
    'vigor',
    body.resources.vigor,
    now.getTime(),
    resourceMax('vigor', body.ctx),
    vigorCost,
  );
  if (!vigor) throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Wigoru');
  const guardian = isWellGuardian(floor);
  const mutator = abyssMutatorBp(awakeningWeekStart(now.getTime()));
  const statBase = floor > 100 ? wellEnemyStat(floor, mutator) : enemyStat(floor);
  const lifeBase = floor > 100 ? wellEnemyLife(floor, mutator) : enemyLife(floor);
  const damage = floor > 100 ? wellEnemyDamage(floor, mutator) : enemyDamage(floor);
  const stat = Math.round(statBase * (guardian ? 1.15 : 1)) * (whisper === 'plunder' ? 1.15 : 1);
  const rounded = Math.round(stat);
  const seed = randomBytes(16).toString('base64url');
  const result = simulateCombat(
    { ...body.player, life: body.resources.life.value, maxLife: body.player.maxLife },
    {
      stats: { strength: rounded, defense: rounded, accuracy: rounded, evasion: rounded },
      life: Math.round(lifeBase * (guardian ? 1.5 : 1)),
      damage,
      dread: wellFightDread(floor, guardian, whisper === 'hush'),
      gaze: false,
    },
    seed,
  );
  await commitPortalHearth(db, locked.id, now, wellContaminationTenths(floor), 0);
  let resources = { ...body.resources, vigor };
  if (result.winner !== 'player') {
    const carried = (await walletOf(db, locked.id)).silver;
    const loss = lootersLoss(carried);
    if (loss > 0) {
      await postLedgerEntry(db, {
        characterId: locked.id,
        currency: 'silver',
        delta: -loss,
        reason: 'well.looters',
        refId: seed,
        idempotencyKey: `well:${seed}:looters`,
      });
    }
    await enterHospital(db, locked, resources, now, guardian ? 4 : 1);
    await savePortal(db, row);
    return { result: { winner: result.winner, rounds: result.rounds }, floor, keysGained: 0 };
  }

  const rank = guardian ? 'guardian' : 'random';
  let experience = fightExperience(enemyLevel(floor), locked.level, rank);
  let silver = fightSilver(
    enemyLevel(floor),
    createRng(`${seed}:silver`).nextInt(8_000, 12_000),
    rank,
  );
  if (whisper === 'plunder') {
    experience = Math.round(experience * 1.3);
    silver = Math.round(silver * 1.3);
  }
  if (whisper === 'tide') experience = Math.round(experience * 0.8);
  await persistProgress(db, locked, experience);
  if (silver > 0) {
    await postLedgerEntry(db, {
      characterId: locked.id,
      currency: 'silver',
      delta: silver,
      reason: 'well.reward',
      refId: seed,
      idempotencyKey: `well:${seed}:silver`,
    });
  }
  let keysGained = 0;
  if (guardian && !row.wellGuardians.includes(floor)) {
    row = withRing(row, addLootKeys(ringOf(materializePortal(row, now)), WELL_GUARDIAN_KEYS), now);
    row = {
      ...row,
      meteorShards: row.meteorShards + WELL_GUARDIAN_METEORS,
      wellGuardians: [...row.wellGuardians, floor],
    };
    keysGained = WELL_GUARDIAN_KEYS;
  }
  row = { ...row, wellFloor: floor };
  await savePortal(db, row);
  const sanityDelta = result.sanityEnd - result.sanityStart;
  if (sanityDelta !== 0 && whisper !== 'hush') {
    resources = {
      ...resources,
      sanity: adjustResource(
        'sanity',
        resources.sanity,
        now.getTime(),
        body.player.maxSanity,
        sanityDelta,
      ),
    };
  }
  await saveResources(db, locked.id, resources);
  if (floor > 100) await recordAbyssFloor(db, locked.id, floor, now);
  if (guardian && floor >= 50 && keysGained > 0) {
    await noteClockAction(db, locked.id, 'wellGuardian', now);
  }
  await audit(db, who, locked.id, 'well.fight', { floor, experience, keysGained });
  return {
    result: { winner: 'player' as const, rounds: result.rounds },
    floor,
    experience,
    silver,
    keysGained,
    whisperPending: wellWhisperPending(floor, row.whisperUntilFloor),
  };
}

export async function holdSeance(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  await lockCharacter(db, character.id);
  await assertCanAct(db, character, now);
  let row = await loadPortal(db, character.id, true);
  if (row.candles < 1) throw new AppError(409, ERROR_CODES.requirement, 'Brak Świecy');
  const seed = randomBytes(16).toString('base64url');
  const roll = rollSeanceFromSeed(seed, row.seanceDry, row.beyondDry);
  row = { ...row, candles: row.candles - 1, seanceDry: roll.dry, beyondDry: roll.beyondDry };
  let echoId: string | null = null;
  if (roll.outcome === 'echo' && roll.rarity && roll.rarity !== 'beyond') {
    const pool = seanceEchoesOf(roll.rarity);
    const picked = pool[createRng(`${seed}:echo`).nextInt(0, Math.max(0, pool.length - 1))];
    if (picked) {
      echoId = picked.id;
      const prev = row.echoes[picked.id] ?? { shards: 0, level: 0 };
      row = {
        ...row,
        echoes: { ...row.echoes, [picked.id]: { ...prev, shards: prev.shards + 1 } },
      };
    }
  } else if (roll.outcome === 'echo' && roll.rarity === 'beyond') {
    row = { ...row, ectoplasm: row.ectoplasm + 80 };
  } else if (roll.outcome === 'gear') {
    const silver = Math.max(1, Math.round(20 * pow125(character.level)));
    await postLedgerEntry(db, {
      characterId: character.id,
      currency: 'silver',
      delta: silver,
      reason: 'seance.gear',
      refId: seed,
      idempotencyKey: `seance:${seed}:gear`,
    });
  } else {
    await giveItem(db, character.id, 'consumable.coffee');
  }
  await savePortal(db, row);
  await audit(db, who, character.id, 'seance', { outcome: roll.outcome, echoId });
  return { outcome: roll.outcome, rarity: roll.rarity, echoId, candles: row.candles };
}

export async function activateEcho(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  echoId: string,
) {
  const def = findEcho(echoId);
  if (!def) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego Echa');
  const row = await loadPortal(db, character.id, true);
  const progress = row.echoes[echoId] ?? { shards: 0, level: 0 };
  if (progress.level === 0) {
    if (progress.shards < 1) throw new AppError(409, ERROR_CODES.requirement, 'Brak odłamka Echa');
    const echoes = {
      ...row.echoes,
      [echoId]: { shards: progress.shards - 1, level: 1 },
    };
    const next = { ...row, echoes, activeEchoId: echoId };
    await savePortal(db, next);
    await audit(db, who, character.id, 'echo.activate', { echoId });
    return { echoId, level: 1 };
  }
  if (progress.level >= ECHO_MAX_LEVEL) {
    throw new AppError(409, ERROR_CODES.requirement, 'Echo jest już w pełni wspomniane');
  }
  const cost = echoUpgradeCost(progress.level);
  if (progress.shards < cost)
    throw new AppError(409, ERROR_CODES.requirement, 'Za mało odłamków Echa');
  const echoes = {
    ...row.echoes,
    [echoId]: { shards: progress.shards - cost, level: progress.level + 1 },
  };
  await savePortal(db, { ...row, echoes, activeEchoId: echoId });
  return { echoId, level: progress.level + 1 };
}

/** Rozkład przeklętego przedmiotu: 10% na Odłamek Klucza (GDD 5.12.5). */
export async function decomposeItem(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  itemId: string,
) {
  const [item] = await db
    .select()
    .from(itemInstances)
    .where(and(eq(itemInstances.id, itemId), eq(itemInstances.characterId, character.id)))
    .limit(1);
  if (!item) throw new AppError(404, ERROR_CODES.notFound, 'Nie masz tego przedmiotu');
  if (item.equippedSlot)
    throw new AppError(409, ERROR_CODES.requirement, 'Najpierw zdejmij przedmiot');
  await db.delete(itemInstances).where(eq(itemInstances.id, item.id));
  let shards = 0;
  if (item.rarity === 'cursed' && createRng(item.id).rollBp(1_000)) {
    await grantKeyShards(db, character.id, 1, clock.now());
    shards = 1;
  }
  await audit(db, who, character.id, 'forge.decompose', { itemId, shards });
  return { shards };
}
