/**
 * Systemy Etapu 1: samouczek, Łowy, Fechtownia, ekwipunek, sklep, Kasa,
 * konsumpcja i zadanie dzienne. Każda funkcja działa wewnątrz transakcji.
 */
import { randomBytes } from 'node:crypto';

import {
  CIRCLE_PROMOTION_WINS,
  COMBAT_STATS,
  DAILY_TASK_COFFEE,
  ENEMIES,
  ERROR_CODES,
  HUNT_NAMED_TARGETS,
  HUNT_RANDOM_TARGETS,
  HUNT_REFRESH_TOIL_COST,
  HUNT_ROTATION_MS,
  HUNT_VIGOR_COST,
  JUNK_DROP_CHANCE_BP,
  MAX_TRAINING_HALL_THIS_STAGE,
  TOP_CIRCLE_THIS_STAGE,
  UNARMED_DAMAGE,
  applyBp,
  bankDepositFee,
  circleDef,
  computeLoadout,
  createRng,
  dailyTaskExperience,
  effectiveStatsCenti,
  enemyAtFloor,
  experienceToNextLevel,
  fightExperience,
  fightSilver,
  findEnemy,
  findGear,
  findItem,
  gearValue,
  grantClassExperience,
  eruditionFromCourses,
  markedTrainingGain,
  resourceContextFor,
  resourceMax,
  simulateCombat,
  spendResource,
  statUnits,
  tierRequiredLevel,
  trainingGainCenti,
  trainingHall,
  trainingRoomFactor,
  tutorialEnemy,
  utcDay,
  weaponDamage,
  type CombatResult,
  type CombatStat,
} from '@game/shared';
import { and, eq, isNull } from 'drizzle-orm';

import { writeAudit, type AuditActor } from '../audit.js';
import type { Clock } from '../clock.js';
import type { Executor } from '../db/client.js';
import {
  characterStats,
  classProgress,
  hearthStates,
  loreStates,
  combatLogs,
  dailyStates,
  huntBoards,
  itemInstances,
  type CharacterRow,
  type HuntTargetStored,
} from '../db/schema.js';
import { AppError } from '../errors.js';
import {
  assertCanAct,
  enterHospital,
  equippedOf,
  loadStats,
  resolveStatus,
  statBlock,
} from './avatar.js';
import { applyDefeatWound } from './hearth.js';
import { persistProgress } from './progress.js';
import { materializeAll, saveResources, toResourcesDto } from './resources.js';
import { grantHuntShard, grantLootKeys, touchCalendar } from './portal-state.js';
import { loadWorld } from './world-state.js';
import { postLedgerEntry, walletOf } from './wallet.js';

const audit = async (
  db: Executor,
  who: AuditActor,
  characterId: string,
  action: string,
  after: unknown,
) => {
  await writeAudit(db, who, { action, characterId, after });
};

async function view(db: Executor, character: CharacterRow, now: Date) {
  const resources = await resolveStatus(db, character, now);
  const statsRow = await loadStats(db, character.id);
  const base = statBlock(statsRow);
  const journey = await loadWorld(db, character.id);
  const loadout = computeLoadout(await equippedOf(db, character.id), journey.sealedItems);
  const effective = effectiveStatsCenti(base, loadout);
  const ctx = resourceContextFor(character.level, loadout);
  const current = await materializeAll(db, character.id, resources, ctx, now);
  const [klass] = loadout.classId
    ? await db
        .select()
        .from(classProgress)
        .where(
          and(
            eq(classProgress.characterId, character.id),
            eq(classProgress.classId, loadout.classId),
          ),
        )
        .limit(1)
    : [];
  return {
    statsRow,
    base,
    loadout,
    effective,
    ctx,
    resources: current,
    classLevel: klass?.level ?? 0,
  };
}

function combatant(state: Awaited<ReturnType<typeof view>>, character: CharacterRow) {
  const weapon = state.loadout.weapon;
  const gear = weapon ? findGear(weapon.itemId) : undefined;
  const armed = weapon && gear;
  return {
    level: character.level,
    stats: {
      strength: statUnits(state.effective.strength),
      defense: statUnits(state.effective.defense),
      accuracy: statUnits(state.effective.accuracy),
      evasion: statUnits(state.effective.evasion),
    },
    life: state.resources.life.value,
    maxLife: resourceMax('life', state.ctx),
    sanity: state.resources.sanity.value,
    maxSanity: resourceMax('sanity', state.ctx),
    classId: state.loadout.classId,
    weaponDamage: armed
      ? weaponDamage(gear.tier, weapon.qualityBp, weapon.enhancement, state.classLevel)
      : UNARMED_DAMAGE,
    knowledge: 0,
  };
}

async function awardExperience(
  db: Executor,
  character: CharacterRow,
  amount: number,
  classId: string | null,
) {
  const updated = await persistProgress(db, character, amount);
  if (classId && amount > 0) {
    const [klass] = await db
      .select()
      .from(classProgress)
      .where(and(eq(classProgress.characterId, character.id), eq(classProgress.classId, classId)))
      .limit(1);
    const next = grantClassExperience(
      { level: klass?.level ?? 0, experience: klass?.experience ?? 0 },
      amount,
    );
    await db
      .insert(classProgress)
      .values({ characterId: character.id, classId, ...next })
      .onConflictDoUpdate({
        target: [classProgress.characterId, classProgress.classId],
        set: next,
      });
  }
  return updated;
}

function boardTargets(characterId: string, circle: number, at: number): HuntTargetStored[] {
  const def = circleDef(circle);
  const rng = createRng(`${characterId}:łowy:${circle}:${Math.floor(at / HUNT_ROTATION_MS)}`);
  const random = ENEMIES.filter((enemy) => enemy.circle === circle && !enemy.named);
  const named = ENEMIES.filter((enemy) => enemy.circle === circle && enemy.named);
  const targets: HuntTargetStored[] = [];
  for (let i = 0; i < HUNT_RANDOM_TARGETS; i++) {
    const enemy = random[rng.nextInt(0, Math.max(0, random.length - 1))];
    if (!enemy) break;
    targets.push({
      enemyId: enemy.id,
      floor: rng.nextInt(def.floorMin, Math.max(def.floorMin, def.floorMax - 1)),
      named: false,
    });
  }
  for (let i = 0; i < HUNT_NAMED_TARGETS; i++) {
    const enemy = named[i % named.length];
    if (!enemy) break;
    targets.push({ enemyId: enemy.id, floor: def.floorMax, named: true });
  }
  return targets.sort((a, b) => a.floor - b.floor);
}

async function ensureBoard(db: Executor, characterId: string, circle: number, now: Date) {
  const [board] = await db
    .select()
    .from(huntBoards)
    .where(eq(huntBoards.characterId, characterId))
    .limit(1);
  const stale =
    !board ||
    now.getTime() - board.generatedAt.getTime() >= HUNT_ROTATION_MS ||
    board.circle !== circle;
  if (!stale) return board;
  const targets = boardTargets(characterId, circle, now.getTime());
  const values = { characterId, circle, generatedAt: now, targets };
  await db
    .insert(huntBoards)
    .values(values)
    .onConflictDoUpdate({
      target: huntBoards.characterId,
      set: { circle, generatedAt: now, targets },
    });
  return values;
}

export async function giveItem(
  db: Executor,
  characterId: string,
  defId: string,
  qualityBp = 10_000,
  rarity = 'common',
) {
  const def = findItem(defId);
  if (!def) return;
  if (def.kind === 'consumable' || def.kind === 'junk') {
    const [stack] = await db
      .select()
      .from(itemInstances)
      .where(
        and(
          eq(itemInstances.characterId, characterId),
          eq(itemInstances.defId, defId),
          isNull(itemInstances.equippedSlot),
        ),
      )
      .limit(1);
    if (stack) {
      await db
        .update(itemInstances)
        .set({ quantity: stack.quantity + 1 })
        .where(eq(itemInstances.id, stack.id));
      return;
    }
  }
  await db.insert(itemInstances).values({ characterId, defId, qualityBp, rarity, quantity: 1 });
}

export async function profileOf(db: Executor, character: CharacterRow, clock: Clock) {
  const now = clock.now();
  const state = await view(db, character, now);
  const units = (value: number) => Math.round(value) / 100;
  return {
    stats: {
      strength: units(statUnits(state.effective.strength) * 100),
      defense: units(statUnits(state.effective.defense) * 100),
      accuracy: units(statUnits(state.effective.accuracy) * 100),
      evasion: units(statUnits(state.effective.evasion) * 100),
    },
    baseStats: {
      strength: units(state.base.strength),
      defense: units(state.base.defense),
      accuracy: units(state.base.accuracy),
      evasion: units(state.base.evasion),
    },
    classId: state.loadout.classId,
    classLevel: state.classLevel,
    circle: state.statsRow.circle,
    hall: state.statsRow.hall,
    status: state.statsRow.status,
    statusUntil: state.statsRow.statusUntil?.toISOString() ?? null,
    tutorialDone: state.statsRow.tutorialDone,
    resources: toResourcesDto(state.resources, state.ctx),
    wallet: await walletOf(db, character.id),
  };
}

async function finishFight(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  now: Date,
  enemyId: string,
  floor: number,
  named: boolean,
  result: CombatResult,
  seed: string,
) {
  const state = await view(db, character, now);
  let resources = state.resources;
  let updated = character;
  let silver = 0;
  if (result.winner === 'player') {
    const { enemyLevel } = await import('@game/shared');
    const experience = fightExperience(
      enemyLevel(Math.max(floor, 1)),
      character.level,
      named ? 'named' : 'random',
    );
    silver = fightSilver(
      enemyLevel(Math.max(floor, 1)),
      createRng(`${seed}:silver`).nextInt(8_000, 12_000),
      named ? 'named' : 'random',
    );
    updated = await awardExperience(db, character, experience, state.loadout.classId);
    if (silver > 0) {
      await postLedgerEntry(db, {
        characterId: character.id,
        currency: 'silver',
        delta: silver,
        reason: 'hunt.reward',
        refId: seed,
        idempotencyKey: `hunt:${seed}:silver`,
      });
    }
    await grantHuntShard(db, character.id, state.statsRow.circle, named, seed, now);
    if (named) {
      const wins = state.statsRow.namedWins + 1;
      const promote =
        wins >= CIRCLE_PROMOTION_WINS && state.statsRow.circle > TOP_CIRCLE_THIS_STAGE;
      await db
        .update(characterStats)
        .set({
          namedWins: promote ? 0 : wins,
          circle: promote ? state.statsRow.circle - 1 : state.statsRow.circle,
        })
        .where(eq(characterStats.characterId, character.id));
    }
    if (createRng(`${seed}:junk`).rollBp(JUNK_DROP_CHANCE_BP)) {
      const junk = (await import('@game/shared')).JUNK.filter(
        (item) => item.circle === state.statsRow.circle,
      );
      const drop = junk[createRng(`${seed}:which`).nextInt(0, Math.max(0, junk.length - 1))];
      if (drop) await giveItem(db, character.id, drop.id);
    }
  } else {
    const carried = (await walletOf(db, character.id)).silver;
    const loss = applyBp(carried, 1_000);
    if (loss > 0) {
      await postLedgerEntry(db, {
        characterId: character.id,
        currency: 'silver',
        delta: -loss,
        reason: 'looters',
        refId: seed,
        idempotencyKey: `hunt:${seed}:looters`,
      });
    }
    const dread = findEnemy(enemyId)?.dread ?? 0;
    resources = await enterHospital(db, character, resources, now, dread);
    await applyDefeatWound(db, character.id, now, dread, `${seed}:wound`);
  }
  const [log] = await db
    .insert(combatLogs)
    .values({
      characterId: character.id,
      seed,
      enemyId,
      floor,
      winner: result.winner,
      log: result,
      engineVersion: result.engineVersion,
      balanceVersion: result.balanceVersion,
    })
    .returning();
  await audit(db, who, character.id, 'hunt.fight', { enemyId, winner: result.winner, silver });
  return {
    combatId: log?.id,
    result,
    resources: toResourcesDto(resources, state.ctx),
    character: updated,
  };
}

export async function fightTutorial(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  await assertCanAct(db, character, now);
  const stats = await loadStats(db, character.id);
  if (stats.tutorialDone) {
    throw new AppError(409, ERROR_CODES.requirement, 'Samouczek został już ukończony');
  }
  const seed = randomBytes(16).toString('base64url');
  const state = await view(db, character, now);
  const result = simulateCombat(combatant(state, character), tutorialEnemy(), seed);
  const finished = await finishFight(db, who, character, now, TUTORIAL_ID, 0, false, result, seed);
  await db
    .update(characterStats)
    .set({ tutorialDone: true })
    .where(eq(characterStats.characterId, character.id));
  await giveItem(db, character.id, 'gear.butcher.weapon.1');
  return finished;
}

const TUTORIAL_ID = 'enemy.morgue-drowned';

export async function huntBoard(db: Executor, character: CharacterRow, clock: Clock) {
  const now = clock.now();
  const stats = await loadStats(db, character.id);
  const board = await ensureBoard(db, character.id, stats.circle, now);
  return {
    circle: stats.circle,
    refreshesAt: new Date(board.generatedAt.getTime() + HUNT_ROTATION_MS).toISOString(),
    targets: board.targets.map((target, index) => ({
      index,
      ...target,
      name: findEnemy(target.enemyId)?.name ?? target.enemyId,
    })),
  };
}

export async function refreshHunt(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  await assertCanAct(db, character, now);
  const stats = await loadStats(db, character.id);
  const state = await view(db, character, now);
  const spent = spendResource(
    'toil',
    state.resources.toil,
    now.getTime(),
    resourceMax('toil', state.ctx),
    HUNT_REFRESH_TOIL_COST,
  );
  if (!spent) throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Znoju');
  await saveResources(db, character.id, { ...state.resources, toil: spent });
  const [noise] = randomBytes(1);
  const targets = boardTargets(character.id, stats.circle, now.getTime() + (noise ?? 0));
  await db
    .insert(huntBoards)
    .values({ characterId: character.id, circle: stats.circle, generatedAt: now, targets })
    .onConflictDoUpdate({
      target: huntBoards.characterId,
      set: { generatedAt: now, targets, circle: stats.circle },
    });
  await audit(db, who, character.id, 'hunt.refresh', { circle: stats.circle });
  return huntBoard(db, character, clock);
}

export async function fightHunt(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  index: number,
) {
  const now = clock.now();
  await assertCanAct(db, character, now);
  const stats = await loadStats(db, character.id);
  const board = await ensureBoard(db, character.id, stats.circle, now);
  const target = board.targets[index];
  if (!target) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego celu');
  const enemy = findEnemy(target.enemyId);
  if (!enemy) throw new AppError(404, ERROR_CODES.notFound, 'Nieznany wróg');
  const state = await view(db, character, now);
  const vigor = spendResource(
    'vigor',
    state.resources.vigor,
    now.getTime(),
    resourceMax('vigor', state.ctx),
    HUNT_VIGOR_COST,
  );
  if (!vigor) throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Wigoru');
  await saveResources(db, character.id, { ...state.resources, vigor });
  const seed = randomBytes(16).toString('base64url');
  const result = simulateCombat(
    { ...combatant({ ...state, resources: { ...state.resources, vigor } }, character) },
    enemyAtFloor(enemy, Math.max(1, target.floor)),
    seed,
  );
  return finishFight(db, who, character, now, enemy.id, target.floor, target.named, result, seed);
}

export async function train(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  stat: CombatStat,
  vigor: number,
) {
  if (!COMBAT_STATS.includes(stat))
    throw new AppError(400, ERROR_CODES.validation, 'Nieznana statystyka');
  const now = clock.now();
  await assertCanAct(db, character, now);
  const stats = await loadStats(db, character.id, true);
  const hall = trainingHall(stats.hall);
  const [lore] = await db
    .select({ coursesDone: loreStates.coursesDone })
    .from(loreStates)
    .where(eq(loreStates.characterId, character.id))
    .limit(1);
  const [hearth] = await db
    .select({
      houseId: hearthStates.houseId,
      buildEndsAt: hearthStates.buildEndsAt,
      arrears: hearthStates.arrears,
      rooms: hearthStates.rooms,
    })
    .from(hearthStates)
    .where(eq(hearthStates.characterId, character.id))
    .limit(1);
  const houseReady = Boolean(
    hearth?.houseId && (!hearth.buildEndsAt || hearth.buildEndsAt <= now) && !hearth.arrears,
  );
  const roomLevel = houseReady ? (hearth?.rooms.training ?? 0) : 0;
  const state = await view(db, character, now);
  const spent = spendResource(
    'vigor',
    state.resources.vigor,
    now.getTime(),
    resourceMax('vigor', state.ctx),
    vigor,
  );
  if (!spent) throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Wigoru');
  const gain = markedTrainingGain(
    trainingGainCenti(
      stats[stat],
      vigor,
      hall.gain * trainingRoomFactor(roomLevel),
      eruditionFromCourses(lore?.coursesDone ?? []),
    ),
    character.markTraining,
  );
  await db
    .update(characterStats)
    .set({ [stat]: stats[stat] + gain })
    .where(eq(characterStats.characterId, character.id));
  await saveResources(db, character.id, { ...state.resources, vigor: spent });
  await audit(db, who, character.id, 'training', { stat, vigor, gain });
  return { stat, gainCenti: gain, vigorLeft: spent.value };
}

export async function unlockHall(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  hall: number,
) {
  const def = trainingHall(hall);
  if (hall > MAX_TRAINING_HALL_THIS_STAGE) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ta sala otwiera się później');
  }
  const stats = await loadStats(db, character.id, true);
  if (stats.hall >= hall) return { hall: stats.hall };
  const sum = (stats.strength + stats.defense + stats.accuracy + stats.evasion) / 100;
  if (sum < def.requiredStatSum) {
    throw new AppError(409, ERROR_CODES.requirement, 'Za niskie statystyki, by wejść do tej sali');
  }
  if (def.unlockSilver > 0) {
    await postLedgerEntry(db, {
      characterId: character.id,
      currency: 'silver',
      delta: -def.unlockSilver,
      reason: 'training.unlock',
      refId: String(hall),
      idempotencyKey: `hall:${character.id}:${hall}`,
    });
  }
  await db.update(characterStats).set({ hall }).where(eq(characterStats.characterId, character.id));
  await audit(db, who, character.id, 'training.unlock', { hall });
  return { hall };
}

export async function buyItem(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  itemId: string,
) {
  const def = findItem(itemId);
  if (!def || def.kind === 'junk' || (def.kind === 'consumable' && !def.sold)) {
    throw new AppError(404, ERROR_CODES.notFound, 'Sklep tego nie sprzedaje');
  }
  if (def.kind === 'gear' && character.level < tierRequiredLevel(def.tier)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Za niski poziom na ten Stopień');
  }
  const price =
    def.kind === 'consumable' ? def.value : gearValue(def.slot, def.tier, 10_000, 'common');
  await postLedgerEntry(db, {
    characterId: character.id,
    currency: 'silver',
    delta: -price,
    reason: 'shop.buy',
    refId: itemId,
    idempotencyKey: `shop:${randomBytes(8).toString('hex')}`,
  });
  await giveItem(db, character.id, itemId);
  await audit(db, who, character.id, 'shop.buy', { itemId, price });
  return { itemId, price };
}

export async function equipItem(db: Executor, character: CharacterRow, itemId: string) {
  const [item] = await db
    .select()
    .from(itemInstances)
    .where(and(eq(itemInstances.id, itemId), eq(itemInstances.characterId, character.id)))
    .limit(1);
  if (!item) throw new AppError(404, ERROR_CODES.notFound, 'Nie masz tego przedmiotu');
  const def = findGear(item.defId);
  if (!def) throw new AppError(409, ERROR_CODES.requirement, 'Tego nie da się założyć');
  if (character.level < tierRequiredLevel(def.tier)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Za niski poziom');
  }
  await db
    .update(itemInstances)
    .set({ equippedSlot: null })
    .where(
      and(eq(itemInstances.characterId, character.id), eq(itemInstances.equippedSlot, def.slot)),
    );
  await db
    .update(itemInstances)
    .set({ equippedSlot: def.slot })
    .where(eq(itemInstances.id, item.id));
  return { slot: def.slot };
}

export async function deposit(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  amount: number,
) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError(400, ERROR_CODES.validation, 'Podaj dodatnią kwotę');
  }
  const fee = bankDepositFee(amount);
  await postLedgerEntry(db, {
    characterId: character.id,
    currency: 'silver',
    delta: -(amount + fee),
    reason: 'bank.deposit',
    idempotencyKey: `bank-out:${randomBytes(8).toString('hex')}`,
  });
  await postLedgerEntry(db, {
    characterId: character.id,
    currency: 'bank',
    delta: amount,
    reason: 'bank.deposit',
    idempotencyKey: `bank-in:${randomBytes(8).toString('hex')}`,
  });
  await audit(db, who, character.id, 'bank.deposit', { amount, fee });
  return walletOf(db, character.id);
}

export async function listItems(db: Executor, characterId: string) {
  const rows = await db
    .select()
    .from(itemInstances)
    .where(eq(itemInstances.characterId, characterId));
  return rows.map((row) => ({
    id: row.id,
    defId: row.defId,
    name: findItem(row.defId)?.name ?? row.defId,
    quantity: row.quantity,
    qualityBp: row.qualityBp,
    rarity: row.rarity,
    equippedSlot: row.equippedSlot,
  }));
}

export async function claimDaily(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  const day = utcDay(now.getTime());
  const [state] = await db
    .select()
    .from(dailyStates)
    .where(and(eq(dailyStates.characterId, character.id), eq(dailyStates.day, day)))
    .limit(1);
  if (!state || state.claimed) {
    throw new AppError(409, ERROR_CODES.requirement, 'Dzienne zadanie nie jest gotowe');
  }
  const done = state.tasks.every((task) => (state.progress[task.kind] ?? 0) >= task.target);
  if (!done)
    throw new AppError(409, ERROR_CODES.requirement, 'Nie wszystkie punkty dziennego zadania');
  const xp = dailyTaskExperience(experienceToNextLevel(character.level));
  await awardExperience(db, character, xp, null);
  await grantLootKeys(db, character.id, 1, now);
  await touchCalendar(db, character.id, now);
  for (let i = 0; i < DAILY_TASK_COFFEE; i++) await giveItem(db, character.id, 'consumable.coffee');
  await db
    .update(dailyStates)
    .set({ claimed: true })
    .where(and(eq(dailyStates.characterId, character.id), eq(dailyStates.day, day)));
  await audit(db, who, character.id, 'daily.claim', { xp });
  return { experience: xp };
}
