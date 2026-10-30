/**
 * Zegar Koniunkcji, Latarnie, Bezdeń, Patronat, płatności, polecenia i zaślubiny.
 * Akt liczy się leniwie przy odczycie Obserwatorium: zamknięty dzień nie rusza się drugi raz.
 */
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

import {
  ACT_DAYS,
  CLOCK_PLAYER_ACTIONS,
  ERROR_CODES,
  EVENT_FRAME_COST,
  EVENT_FRAME_ID,
  EVENT_KEY_COST,
  EVENT_KEY_LIMIT,
  FINALE_SIGIL_DOMAIN,
  LANTERN_DARK_PK,
  LANTERN_HELD_MEMBER_KEYS,
  LANTERN_HELD_PL,
  LANTERN_PARTICIPATION_KEYS,
  LANTERN_POSITION_VIGOR,
  LANTERN_VICTORY_SIGIL,
  LANTERNS,
  PATRON_MONTHLY_VOUCHERS,
  PATRON_SEAL_GOOD,
  PATRON_SEAL_SILVER,
  PEARL_PACK,
  PLAYER_POINT_CAP,
  PURCHASED_REFERRAL_PEARLS,
  RENAME_PEARLS,
  THRESHOLD_KEYS,
  actDayIndex,
  awakeningWeekStart,
  cappedSides,
  characterNameSchema,
  closeActDay,
  deadNightOpen,
  extendPatron,
  finaleSigils,
  findCosmetic,
  lanternPhase,
  patronActive,
  referralTitles,
  resolveLantern,
  travelInProgress,
  resourceMax,
  spendResource,
  utcDay,
  abyssRankSigils,
  type ActFinale,
  type ActPace,
  type ClockAction,
} from '@game/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { writeAudit, type AuditActor } from '../audit.js';
import type { Executor } from '../db/client.js';
import {
  abyssPayouts,
  abyssRanks,
  abyssReceipts,
  accounts,
  actContributions,
  actRewards,
  acts,
  characters,
  eventClaims,
  hearthStates,
  lanternApplications,
  lanternStands,
  lanternStates,
  lodgeMembers,
  marriages,
  patronClaims,
  payments,
  referrals,
  type CharacterRow,
} from '../db/schema.js';
import { AppError } from '../errors.js';
import { lockCharacter } from './activities.js';
import { assertCanAct } from './avatar.js';
import { changeStock } from './port.js';
import { grantLootKeys, loadPortal, savePortal } from './portal-state.js';
import { loadResources, materializeAll, resourceContext, saveResources } from './resources.js';
import { InsufficientFundsError, postLedgerEntry } from './wallet.js';
import { loadWorld } from './world-state.js';

const ACT_ID = 'current';

const audit = (
  db: Executor,
  who: AuditActor,
  characterId: string,
  action: string,
  after: unknown,
) => writeAudit(db, who, { action, characterId, after });

async function pay(
  db: Executor,
  characterId: string,
  currency: 'silver' | 'pearls' | 'wax' | 'vouchers',
  amount: number,
  key: string,
  reason: string,
) {
  if (amount === 0) return;
  try {
    await postLedgerEntry(db, {
      characterId,
      currency,
      delta: amount,
      reason,
      idempotencyKey: key,
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało środków');
    }
    throw error;
  }
}

async function ensureLanterns(db: Executor) {
  for (const lantern of LANTERNS) {
    await db
      .insert(lanternStates)
      .values({ sleeperId: lantern.sleeperId, status: 'open' })
      .onConflictDoNothing();
  }
}

function paceOf(value: string): ActPace {
  return value === 'accelerated' ? 'accelerated' : 'live';
}

function actFinale(value: string): ActFinale {
  if (value === 'repelled' || value === 'emergence') return value;
  return 'pending';
}

async function lockAct(db: Executor) {
  const [act] = await db.select().from(acts).where(eq(acts.id, ACT_ID)).limit(1).for('update');
  return act ?? null;
}

async function payKeys(
  db: Executor,
  actId: string,
  characterId: string,
  kind: string,
  keys: number,
  now: Date,
) {
  const inserted = await db
    .insert(actRewards)
    .values({ actId, characterId, kind })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0 || keys <= 0) return;
  await lockCharacter(db, characterId);
  await grantLootKeys(db, characterId, keys, now);
}

async function addSigils(db: Executor, characterId: string, sigils: number) {
  if (sigils <= 0) return;
  await lockCharacter(db, characterId);
  const row = await loadPortal(db, characterId, true);
  const key = String(FINALE_SIGIL_DOMAIN);
  await savePortal(db, {
    ...row,
    sigils: { ...row.sigils, [key]: (row.sigils[key] ?? 0) + sigils },
  });
}

async function payFinale(db: Executor, actId: string, finale: 'repelled' | 'emergence') {
  const rows = await db.select().from(actContributions).where(eq(actContributions.actId, actId));
  const contributed = new Set(rows.filter((row) => row.rawPl > 0).map((row) => row.characterId));
  const cultRows = await db
    .select({ characterId: hearthStates.characterId, cult: hearthStates.cultSleeper })
    .from(hearthStates);
  const cult = new Set(cultRows.filter((row) => row.cult !== null).map((row) => row.characterId));
  const ids = [...new Set([...contributed, ...cult])].sort();
  for (const characterId of ids) {
    const sigils = finaleSigils(finale, contributed.has(characterId), cult.has(characterId));
    if (sigils <= 0) continue;
    const inserted = await db
      .insert(actRewards)
      .values({ actId, characterId, kind: 'finale' })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) continue;
    await addSigils(db, characterId, sigils);
  }
}

/** Zamyka pełne dni aktu. Drugie wywołanie nie dopisuje nagród. */
export async function catchUp(db: Executor, now: Date) {
  const act = await lockAct(db);
  if (!act) return null;
  let clock = {
    day: act.closedDays,
    clockBp: act.clockBp,
    finale: actFinale(act.finale),
    thresholds: act.thresholds,
  };
  let pendingPk = act.pendingPk;
  const pace = paceOf(act.pace);
  const index = actDayIndex(now.getTime(), act.startedAt.getTime(), pace);
  while (clock.finale === 'pending' && clock.day < Math.min(index, ACT_DAYS)) {
    const day = clock.day;
    const rows = await db
      .select()
      .from(actContributions)
      .where(and(eq(actContributions.actId, act.id), eq(actContributions.dayIndex, day)));
    let pl = 0;
    let pk = pendingPk;
    const active: string[] = [];
    for (const row of rows) {
      const sides = cappedSides(row.rawPl, row.rawPk);
      pl += sides.pl;
      pk += sides.pk;
      if (row.rawPl + row.rawPk > 0) active.push(row.characterId);
    }
    const held = await db.select().from(lanternStates).where(eq(lanternStates.status, 'held'));
    pl += held.length * LANTERN_HELD_PL;
    const step = closeActDay(clock, pl, pk, active.length);
    pendingPk = 0;
    clock =
      step.state.finale === 'pending' ? step.state : { ...step.state, finale: step.state.finale };
    await db
      .update(acts)
      .set({
        clockBp: clock.clockBp,
        closedDays: clock.day,
        finale: clock.finale,
        thresholds: clock.thresholds,
        pendingPk: 0,
      })
      .where(eq(acts.id, act.id));
    for (const threshold of step.crossed) {
      for (const characterId of [...active].sort()) {
        await payKeys(db, act.id, characterId, `threshold-${threshold}`, THRESHOLD_KEYS, now);
      }
    }
    const lodgeIds = held
      .map((lantern) => lantern.lodgeId)
      .filter((id): id is string => id !== null);
    if (lodgeIds.length > 0) {
      const members = await db
        .select({ characterId: lodgeMembers.characterId })
        .from(lodgeMembers)
        .where(inArray(lodgeMembers.lodgeId, lodgeIds));
      for (const member of members) {
        await payKeys(
          db,
          act.id,
          member.characterId,
          `lantern-${day}`,
          LANTERN_HELD_MEMBER_KEYS,
          now,
        );
      }
    }
    if (step.finaleStarted && clock.finale !== 'pending') {
      await payFinale(db, act.id, clock.finale);
    }
  }
  const [fresh] = await db.select().from(acts).where(eq(acts.id, act.id)).limit(1);
  return fresh ?? null;
}

export async function openObservatory(
  db: Executor,
  character: CharacterRow,
  now: Date,
  pace: ActPace | null,
  allowAccelerated: boolean,
) {
  await ensureLanterns(db);
  const [existing] = await db.select().from(acts).where(eq(acts.id, ACT_ID)).limit(1);
  if (!existing) {
    const chosen = pace ?? 'live';
    if (chosen === 'accelerated' && !allowAccelerated) {
      throw new AppError(409, ERROR_CODES.requirement, 'Przyspieszony akt jest tylko w próbie');
    }
    await db.insert(acts).values({
      id: ACT_ID,
      startedAt: now,
      pace: chosen,
      clockBp: 0,
      closedDays: 0,
      finale: 'pending',
      thresholds: [],
      pendingPk: 0,
    });
  }
  const act = await catchUp(db, now);
  if (!act) throw new AppError(500, ERROR_CODES.internal, 'Akt nie powstał');
  const ranking = await db
    .select({
      name: characters.name,
      pl: sql<number>`sum(${actContributions.rawPl})`.mapWith(Number),
    })
    .from(actContributions)
    .innerJoin(characters, eq(characters.id, actContributions.characterId))
    .where(eq(actContributions.actId, act.id))
    .groupBy(characters.name)
    .orderBy(desc(sql`sum(${actContributions.rawPl})`))
    .limit(10);
  const patron = patronActive(character.patronUntil?.getTime() ?? null, now.getTime());
  return {
    pace: paceOf(act.pace),
    day: act.closedDays,
    days: ACT_DAYS,
    clockBp: act.clockBp,
    finale: act.finale,
    thresholds: act.thresholds,
    ranking,
    deadNight: deadNightOpen(now.getTime()),
    patron,
    domain: 'Nyarlathotep',
  };
}

export async function noteClockAction(
  db: Executor,
  characterId: string,
  action: ClockAction,
  now: Date,
) {
  const [act] = await db.select().from(acts).where(eq(acts.id, ACT_ID)).limit(1);
  if (act?.finale !== 'pending') return { accepted: 0 };
  const day = actDayIndex(now.getTime(), act.startedAt.getTime(), paceOf(act.pace));
  if (day < act.closedDays || day >= ACT_DAYS) return { accepted: 0 };
  const spec = CLOCK_PLAYER_ACTIONS[action];
  const where = and(
    eq(actContributions.actId, act.id),
    eq(actContributions.characterId, characterId),
    eq(actContributions.dayIndex, day),
  );
  const [existing] = await db.select().from(actContributions).where(where).limit(1).for('update');
  const rawPl = existing?.rawPl ?? 0;
  const rawPk = existing?.rawPk ?? 0;
  const gain = Math.min(PLAYER_POINT_CAP - rawPl - rawPk, spec.points);
  if (gain <= 0) return { accepted: 0 };
  const nextPl = rawPl + (spec.side === 'pl' ? gain : 0);
  const nextPk = rawPk + (spec.side === 'pk' ? gain : 0);
  if (!existing) {
    await db.insert(actContributions).values({
      actId: act.id,
      characterId,
      dayIndex: day,
      rawPl: nextPl,
      rawPk: nextPk,
    });
  } else {
    await db.update(actContributions).set({ rawPl: nextPl, rawPk: nextPk }).where(where);
  }
  return { accepted: gain };
}

export async function contribute(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  action: ClockAction,
  now: Date,
) {
  await lockCharacter(db, character.id);
  const [act] = await db.select().from(acts).where(eq(acts.id, ACT_ID)).limit(1);
  if (!act) throw new AppError(409, ERROR_CODES.requirement, 'Obserwatorium jeszcze milczy');
  if (act.finale !== 'pending') {
    throw new AppError(409, ERROR_CODES.requirement, 'Akt jest zamknięty');
  }
  const noted = await noteClockAction(db, character.id, action, now);
  await audit(db, who, character.id, 'conjunction.contribute', { action, ...noted });
  return noted;
}

async function masterLodge(db: Executor, characterId: string) {
  const [member] = await db
    .select()
    .from(lodgeMembers)
    .where(eq(lodgeMembers.characterId, characterId))
    .limit(1);
  if (member?.role !== 'master') {
    throw new AppError(409, ERROR_CODES.requirement, 'Zgłoszenie składa Mistrz loży');
  }
  return member.lodgeId;
}

export async function applyLantern(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  sleeperId: string,
  defense: number,
  now: Date,
) {
  if (!LANTERNS.some((lantern) => lantern.sleeperId === sleeperId)) {
    throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej Latarni');
  }
  if (lanternPhase(now.getTime()) !== 'apply') {
    throw new AppError(
      409,
      ERROR_CODES.requirement,
      'Zgłoszenia przyjmuje się od poniedziałku do czwartku',
    );
  }
  const lodgeId = await masterLodge(db, character.id);
  const held = await db
    .select()
    .from(lanternStates)
    .where(and(eq(lanternStates.lodgeId, lodgeId), eq(lanternStates.status, 'held')));
  if (held.length > 0) {
    throw new AppError(409, ERROR_CODES.requirement, 'Najpierw zrzecz się Latarni, którą trzymasz');
  }
  const week = awakeningWeekStart(now.getTime());
  const [already] = await db
    .select()
    .from(lanternApplications)
    .where(and(eq(lanternApplications.weekKey, week), eq(lanternApplications.lodgeId, lodgeId)))
    .limit(1);
  if (already)
    throw new AppError(409, ERROR_CODES.requirement, 'Loża zgłosiła się już w tym tygodniu');
  await db.insert(lanternApplications).values({ weekKey: week, sleeperId, lodgeId, defense });
  await audit(db, who, character.id, 'lantern.apply', { sleeperId, defense });
  return { sleeperId, defense };
}

export async function relinquishLantern(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  sleeperId: string,
) {
  const lodgeId = await masterLodge(db, character.id);
  const [lantern] = await db
    .select()
    .from(lanternStates)
    .where(eq(lanternStates.sleeperId, sleeperId))
    .limit(1)
    .for('update');
  if (lantern?.lodgeId !== lodgeId || lantern.status !== 'held') {
    throw new AppError(409, ERROR_CODES.requirement, 'Tej Latarni nie trzymacie');
  }
  await db
    .update(lanternStates)
    .set({ lodgeId: null, status: 'open' })
    .where(eq(lanternStates.sleeperId, sleeperId));
  await audit(db, who, character.id, 'lantern.relinquish', { sleeperId });
  return { sleeperId };
}

export async function standLantern(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  sleeperId: string,
  now: Date,
) {
  if (lanternPhase(now.getTime()) !== 'battle') {
    throw new AppError(
      409,
      ERROR_CODES.requirement,
      'Bitwa o Latarnię trwa w sobotę 19:00–20:30 UTC',
    );
  }
  await lockCharacter(db, character.id);
  await assertCanAct(db, character, now);
  const [member] = await db
    .select()
    .from(lodgeMembers)
    .where(eq(lodgeMembers.characterId, character.id))
    .limit(1);
  if (!member) throw new AppError(409, ERROR_CODES.requirement, 'Stanowisko bierze członek loży');
  const week = awakeningWeekStart(now.getTime());
  const [lantern] = await db
    .select()
    .from(lanternStates)
    .where(eq(lanternStates.sleeperId, sleeperId))
    .limit(1);
  const [application] = await db
    .select()
    .from(lanternApplications)
    .where(and(eq(lanternApplications.weekKey, week), eq(lanternApplications.sleeperId, sleeperId)))
    .orderBy(desc(lanternApplications.defense))
    .limit(1);
  const wing =
    lantern?.lodgeId === member.lodgeId
      ? 'defender'
      : application?.lodgeId === member.lodgeId
        ? 'pretender'
        : null;
  if (!wing)
    throw new AppError(409, ERROR_CODES.requirement, 'Twoja loża nie stoi przy tej Latarni');
  const ctx = resourceContext(
    character.level,
    0,
    0,
    patronActive(character.patronUntil?.getTime() ?? null, now.getTime()),
  );
  const resources = materializeAll(
    await loadResources(db, character.id, { forUpdate: true }),
    ctx,
    now,
  );
  const vigor = spendResource(
    'vigor',
    resources.vigor,
    now.getTime(),
    resourceMax('vigor', ctx),
    LANTERN_POSITION_VIGOR,
  );
  if (!vigor) throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Wigoru');
  await saveResources(db, character.id, { ...resources, vigor });
  const [stood] = await db
    .select()
    .from(lanternStands)
    .where(
      and(
        eq(lanternStands.weekKey, week),
        eq(lanternStands.sleeperId, sleeperId),
        eq(lanternStands.characterId, character.id),
      ),
    )
    .limit(1);
  if (stood) throw new AppError(409, ERROR_CODES.requirement, 'Już stoisz przy tej Latarni');
  await db.insert(lanternStands).values({
    weekKey: week,
    sleeperId,
    characterId: character.id,
    lodgeId: member.lodgeId,
  });
  await grantLootKeys(db, character.id, LANTERN_PARTICIPATION_KEYS, now);
  await audit(db, who, character.id, 'lantern.stand', { sleeperId, wing });
  return { sleeperId, wing };
}

export async function resolveLanterns(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  now: Date,
) {
  if (lanternPhase(now.getTime()) !== 'payout') {
    throw new AppError(409, ERROR_CODES.requirement, 'Latarnie rozlicza się w niedzielę');
  }
  const act = await lockAct(db);
  await ensureLanterns(db);
  const week = awakeningWeekStart(now.getTime());
  const lanterns = await db.select().from(lanternStates).for('update');
  if (lanterns.every((lantern) => lantern.resolvedWeek === week)) {
    return { week, resolved: false };
  }
  let dark = 0;
  for (const lantern of lanterns) {
    if (lantern.resolvedWeek === week) continue;
    const applications = await db
      .select()
      .from(lanternApplications)
      .where(
        and(
          eq(lanternApplications.weekKey, week),
          eq(lanternApplications.sleeperId, lantern.sleeperId),
        ),
      )
      .orderBy(desc(lanternApplications.defense));
    const pretender = applications[0]?.lodgeId ?? null;
    const stands = await db
      .select()
      .from(lanternStands)
      .where(and(eq(lanternStands.weekKey, week), eq(lanternStands.sleeperId, lantern.sleeperId)));
    const defenderPositions = stands.filter((stand) => stand.lodgeId === lantern.lodgeId).length;
    const pretenderPositions = stands.filter((stand) => stand.lodgeId === pretender).length;
    const result = resolveLantern({
      hasDefender: lantern.status === 'held' && lantern.lodgeId !== null,
      hasPretender: pretender !== null,
      defenderPositions,
      pretenderPositions,
    });
    let lodgeId = lantern.lodgeId;
    let status = lantern.status;
    if (result === 'uncontested' || result === 'pretender') {
      lodgeId = pretender;
      status = 'held';
    } else if (result === 'dark' || result === 'empty') {
      lodgeId = null;
      status = result === 'dark' ? 'dark' : 'open';
      if (result === 'dark') dark += 1;
    }
    await db
      .update(lanternStates)
      .set({ lodgeId, status, resolvedWeek: week })
      .where(eq(lanternStates.sleeperId, lantern.sleeperId));
    if ((result === 'defender' || result === 'pretender') && lodgeId) {
      const winners = stands.filter((stand) => stand.lodgeId === lodgeId);
      for (const winner of winners) {
        await addSigils(db, winner.characterId, LANTERN_VICTORY_SIGIL);
      }
    }
  }
  if (dark > 0 && act?.finale === 'pending') {
    await db
      .update(acts)
      .set({ pendingPk: act.pendingPk + dark * LANTERN_DARK_PK })
      .where(eq(acts.id, act.id));
  }
  await audit(db, who, character.id, 'lantern.resolve', { week, dark });
  return { week, resolved: true, dark };
}

export async function lanternHall(db: Executor, now: Date) {
  await ensureLanterns(db);
  const rows = await db.select().from(lanternStates);
  return {
    phase: lanternPhase(now.getTime()),
    lanterns: LANTERNS.map((lantern) => {
      const row = rows.find((item) => item.sleeperId === lantern.sleeperId);
      return {
        ...lantern,
        status: row?.status ?? 'open',
        held: row?.status === 'held',
      };
    }),
  };
}

export async function recordAbyssFloor(
  db: Executor,
  characterId: string,
  floor: number,
  now: Date,
) {
  if (floor <= 100) return;
  const [row] = await db
    .select()
    .from(abyssRanks)
    .where(eq(abyssRanks.characterId, characterId))
    .limit(1)
    .for('update');
  if (!row) {
    await db.insert(abyssRanks).values({ characterId, floor, updatedAt: now });
    return;
  }
  if (floor > row.floor) {
    await db
      .update(abyssRanks)
      .set({ floor, updatedAt: now })
      .where(eq(abyssRanks.characterId, characterId));
  }
}

export async function abyssBoard(db: Executor, characterId: string) {
  const rows = await db
    .select({
      characterId: abyssRanks.characterId,
      name: characters.name,
      floor: abyssRanks.floor,
    })
    .from(abyssRanks)
    .innerJoin(characters, eq(characters.id, abyssRanks.characterId))
    .orderBy(desc(abyssRanks.floor));
  const place = rows.findIndex((row) => row.characterId === characterId);
  return {
    board: rows.slice(0, 10).map((row, index) => ({
      rank: index + 1,
      name: row.name,
      floor: row.floor,
    })),
    self: place < 0 ? null : { rank: place + 1, floor: rows[place]?.floor ?? 0 },
  };
}

export async function payAbyss(db: Executor, who: AuditActor, character: CharacterRow, now: Date) {
  const week = awakeningWeekStart(now.getTime());
  const [paid] = await db
    .select()
    .from(abyssPayouts)
    .where(eq(abyssPayouts.weekKey, week))
    .limit(1);
  if (paid) {
    const receipts = await db.select().from(abyssReceipts).where(eq(abyssReceipts.weekKey, week));
    await audit(db, who, character.id, 'abyss.payout', { week, paid: false });
    return { week, paid: false, receipts };
  }
  const rows = await db.select().from(abyssRanks).orderBy(desc(abyssRanks.floor)).limit(10);
  await db.insert(abyssPayouts).values({ weekKey: week, paidAt: now });
  const receipts = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const sigils = abyssRankSigils(index + 1);
    await addSigils(db, row.characterId, sigils);
    await db.insert(abyssReceipts).values({ weekKey: week, characterId: row.characterId, sigils });
    receipts.push({ characterId: row.characterId, sigils });
  }
  await audit(db, who, character.id, 'abyss.payout', { week, paid: true });
  return { week, paid: true, receipts };
}

export async function buyPatronSeal(db: Executor, who: AuditActor, character: CharacterRow) {
  await lockCharacter(db, character.id);
  await pay(
    db,
    character.id,
    'silver',
    -PATRON_SEAL_SILVER,
    `patron-seal:${randomUUID()}`,
    'patron.seal',
  );
  await changeStock(db, character.id, PATRON_SEAL_GOOD, 1);
  await audit(db, who, character.id, 'patron.seal', { silver: PATRON_SEAL_SILVER });
  return { good: PATRON_SEAL_GOOD };
}

export async function redeemPatronSeal(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  now: Date,
) {
  await lockCharacter(db, character.id);
  await changeStock(db, character.id, PATRON_SEAL_GOOD, -1);
  const until = new Date(extendPatron(character.patronUntil?.getTime() ?? null, now.getTime()));
  await db.update(characters).set({ patronUntil: until }).where(eq(characters.id, character.id));
  await audit(db, who, character.id, 'patron.redeem', { until: until.toISOString() });
  return { until: until.toISOString() };
}

export async function claimPatronCandle(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  now: Date,
) {
  if (!patronActive(character.patronUntil?.getTime() ?? null, now.getTime())) {
    throw new AppError(409, ERROR_CODES.requirement, 'Świecę Patrona bierze Patron');
  }
  const day = utcDay(now.getTime());
  const inserted = await db
    .insert(patronClaims)
    .values({ characterId: character.id, kind: 'candle', dayKey: day })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) {
    throw new AppError(409, ERROR_CODES.requirement, 'Świeca Patrona na dziś już jest');
  }
  const portal = await loadPortal(db, character.id, true);
  await savePortal(db, { ...portal, candles: portal.candles + 1 });
  await audit(db, who, character.id, 'patron.candle', { day });
  return { candles: portal.candles + 1 };
}

export async function claimPatronVouchers(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  now: Date,
) {
  if (!patronActive(character.patronUntil?.getTime() ?? null, now.getTime())) {
    throw new AppError(409, ERROR_CODES.requirement, 'Kwity Patrona biorą Patroni');
  }
  const month = utcDay(now.getTime()).slice(0, 7);
  const inserted = await db
    .insert(patronClaims)
    .values({ characterId: character.id, kind: 'vouchers', dayKey: month })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) return { vouchers: 0, month };
  await pay(
    db,
    character.id,
    'vouchers',
    PATRON_MONTHLY_VOUCHERS,
    `patron-vouchers:${character.id}:${month}`,
    'patron.vouchers',
  );
  await audit(db, who, character.id, 'patron.vouchers', { month });
  return { vouchers: PATRON_MONTHLY_VOUCHERS, month };
}

export function paymentSignature(receiptId: string, secret: string): string {
  return createHash('sha256').update(`${receiptId}.${secret}`).digest('hex');
}

export async function checkout(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  sku: 'pearls-10' | 'patron-30',
) {
  const [row] = await db
    .insert(payments)
    .values({
      accountId: character.accountId,
      characterId: character.id,
      sku,
      status: 'pending',
    })
    .returning();
  if (!row) throw new AppError(500, ERROR_CODES.internal, 'Paragon nie powstał');
  await audit(db, who, character.id, 'payment.checkout', { sku, id: row.id });
  return { receiptId: row.id, sku };
}

export async function confirmPayment(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  receiptId: string,
  signature: string,
  now: Date,
) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? '';
  if (!secret) {
    throw new AppError(503, ERROR_CODES.requirement, 'Płatności web nie są skonfigurowane');
  }
  if (paymentSignature(receiptId, secret) !== signature) {
    throw new AppError(403, ERROR_CODES.requirement, 'Paragon się nie zgadza');
  }
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, receiptId))
    .limit(1)
    .for('update');
  if (payment?.characterId !== character.id) {
    throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego paragonu');
  }
  if (payment.status === 'paid') return { sku: payment.sku, replayed: true };
  if (payment.sku !== 'pearls-10' && payment.sku !== 'patron-30') {
    throw new AppError(409, ERROR_CODES.requirement, 'Tego nie sprzedajemy za Perły ani pieniądze');
  }
  await db
    .update(payments)
    .set({ status: 'paid', providerRef: signature })
    .where(eq(payments.id, payment.id));
  if (payment.sku === 'pearls-10') {
    await pay(db, character.id, 'pearls', PEARL_PACK, `pearls:${payment.id}`, 'payment.pearls');
  } else {
    const until = new Date(extendPatron(character.patronUntil?.getTime() ?? null, now.getTime()));
    await db.update(characters).set({ patronUntil: until }).where(eq(characters.id, character.id));
  }
  const [referral] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.referredId, character.id))
    .limit(1)
    .for('update');
  if (referral && !referral.rewarded) {
    await db
      .update(referrals)
      .set({ purchased: true, rewarded: true })
      .where(eq(referrals.referredId, character.id));
    await pay(
      db,
      referral.referrerId,
      'pearls',
      PURCHASED_REFERRAL_PEARLS,
      `referral-pearls:${character.id}`,
      'referral.purchase',
    );
  }
  await audit(db, who, character.id, 'payment.confirm', { sku: payment.sku });
  return { sku: payment.sku, replayed: false };
}

export function issueReferralCode(): { code: string; verify: string } {
  const code = randomBytes(6).toString('base64url').slice(0, 8);
  const verify = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return { code, verify };
}

export async function verifyEmail(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  code: string,
  now: Date,
) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, character.accountId))
    .limit(1)
    .for('update');
  if (account?.emailVerifyCode !== code) {
    throw new AppError(403, ERROR_CODES.requirement, 'Kod weryfikacji się nie zgadza');
  }
  await db
    .update(accounts)
    .set({ emailVerifiedAt: now, emailVerifyCode: null })
    .where(eq(accounts.id, account.id));
  await audit(db, who, character.id, 'account.verify', {});
  return { verified: true };
}

export async function bindReferral(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  code: string,
) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.referralCode, code))
    .limit(1);
  if (!account) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego polecenia');
  if (account.id === character.accountId) {
    throw new AppError(409, ERROR_CODES.requirement, 'Nie polecasz sam siebie');
  }
  const [referrer] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, account.id))
    .limit(1);
  if (!referrer) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego polecenia');
  const [existing] = await db
    .select()
    .from(referrals)
    .where(eq(referrals.referredId, character.id))
    .limit(1);
  if (existing) throw new AppError(409, ERROR_CODES.requirement, 'Polecenie jest już zapisane');
  await db.insert(referrals).values({ referredId: character.id, referrerId: referrer.id });
  await audit(db, who, character.id, 'referral.bind', { referrerId: referrer.id });
  return { referrerId: referrer.id };
}

export async function referralView(db: Executor, character: CharacterRow) {
  const rows = await db
    .select({
      level: characters.level,
      verified: accounts.emailVerifiedAt,
      purchased: referrals.purchased,
    })
    .from(referrals)
    .innerJoin(characters, eq(characters.id, referrals.referredId))
    .innerJoin(accounts, eq(accounts.id, characters.accountId))
    .where(eq(referrals.referrerId, character.id));
  const qualified = rows.filter((row) => row.level >= 15 && row.verified !== null).length;
  const titles = referralTitles(qualified);
  const merged = [...new Set([...character.titles, ...titles])];
  if (merged.length !== character.titles.length) {
    await db.update(characters).set({ titles: merged }).where(eq(characters.id, character.id));
  }
  return { qualified, purchased: rows.filter((row) => row.purchased).length, titles: merged };
}

async function sameCity(
  db: Executor,
  left: CharacterRow,
  rightId: string,
  city: string,
  now: Date,
) {
  const leftWorld = await loadWorld(db, left.id);
  const rightWorld = await loadWorld(db, rightId);
  if (leftWorld.city !== city || rightWorld.city !== city) {
    throw new AppError(409, ERROR_CODES.requirement, 'Oboje musicie być w tym mieście');
  }
  if (
    travelInProgress(
      leftWorld.travelTo,
      leftWorld.travelEndsAt?.getTime() ?? null,
      now.getTime(),
    ) ||
    travelInProgress(rightWorld.travelTo, rightWorld.travelEndsAt?.getTime() ?? null, now.getTime())
  ) {
    throw new AppError(409, ERROR_CODES.requirement, 'W drodze nie składa się przysięgi');
  }
}

export async function proposeMarriage(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  partnerId: string,
  rite: 'cathedral' | 'blood',
  now: Date,
) {
  if (partnerId === character.id) {
    throw new AppError(409, ERROR_CODES.requirement, 'Nie zaślubisz sam siebie');
  }
  const city = rite === 'cathedral' ? 'salt' : 'mire';
  await sameCity(db, character, partnerId, city, now);
  const open = await db
    .select()
    .from(marriages)
    .where(
      and(
        eq(marriages.status, 'offered'),
        sql`(${marriages.proposerId} = ${character.id} or ${marriages.partnerId} = ${character.id} or ${marriages.proposerId} = ${partnerId} or ${marriages.partnerId} = ${partnerId})`,
      ),
    );
  if (open.length > 0)
    throw new AppError(409, ERROR_CODES.requirement, 'Jest już otwarte oświadczyny');
  const [row] = await db
    .insert(marriages)
    .values({ proposerId: character.id, partnerId, rite, status: 'offered' })
    .returning();
  await audit(db, who, character.id, 'marriage.propose', { partnerId, rite });
  return { id: row?.id, rite };
}

export async function acceptMarriage(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  marriageId: string,
  now: Date,
) {
  const [row] = await db
    .select()
    .from(marriages)
    .where(eq(marriages.id, marriageId))
    .limit(1)
    .for('update');
  if (row?.partnerId !== character.id || row.status !== 'offered') {
    throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takich oświadczyn');
  }
  const city = row.rite === 'cathedral' ? 'salt' : 'mire';
  const [proposer] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, row.proposerId))
    .limit(1);
  if (!proposer) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takich oświadczyn');
  await sameCity(db, character, proposer.id, city, now);
  await db.update(marriages).set({ status: 'wed' }).where(eq(marriages.id, row.id));
  for (const person of [character, proposer]) {
    const titles = person.titles.includes('Zaślubieni')
      ? person.titles
      : [...person.titles, 'Zaślubieni'];
    await db.update(characters).set({ titles }).where(eq(characters.id, person.id));
  }
  await audit(db, who, character.id, 'marriage.accept', { id: row.id });
  return { id: row.id, status: 'wed' as const };
}

export async function claimDeadNight(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  now: Date,
) {
  if (!deadNightOpen(now.getTime())) {
    throw new AppError(409, ERROR_CODES.requirement, 'Noc Zmarłych jest zamknięta');
  }
  const day = utcDay(now.getTime());
  const inserted = await db
    .insert(eventClaims)
    .values({ characterId: character.id, eventId: 'dead-night', dayKey: day })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) {
    throw new AppError(409, ERROR_CODES.requirement, 'Wosk na dziś już zebrany');
  }
  await pay(db, character.id, 'wax', 10, `wax:${character.id}:${day}`, 'event.wax');
  await audit(db, who, character.id, 'event.dead', { day });
  return { wax: 10 };
}

export async function buyEventGood(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  sku: 'keys' | 'frame',
  paidWith: string,
  now: Date,
) {
  if (paidWith === 'pearls') {
    throw new AppError(409, ERROR_CODES.requirement, 'Kluczy i Sigili nie kupuje się za Perły');
  }
  if (!deadNightOpen(now.getTime())) {
    throw new AppError(409, ERROR_CODES.requirement, 'Noc Zmarłych jest zamknięta');
  }
  if (sku === 'keys') {
    const buys = await db
      .select()
      .from(eventClaims)
      .where(
        and(eq(eventClaims.characterId, character.id), eq(eventClaims.eventId, 'dead-night-key')),
      );
    if (buys.length >= EVENT_KEY_LIMIT) {
      throw new AppError(
        409,
        ERROR_CODES.requirement,
        'Limit kluczy tego wydarzenia jest wyczerpany',
      );
    }
    await pay(
      db,
      character.id,
      'wax',
      -EVENT_KEY_COST,
      `event-key:${character.id}:${buys.length + 1}`,
      'event.key',
    );
    await db.insert(eventClaims).values({
      characterId: character.id,
      eventId: 'dead-night-key',
      dayKey: `key-${buys.length + 1}`,
    });
    await grantLootKeys(db, character.id, 1, now);
    await audit(db, who, character.id, 'event.buy', { sku });
    return { sku, left: EVENT_KEY_LIMIT - buys.length - 1 };
  }
  const inserted = await db
    .insert(eventClaims)
    .values({ characterId: character.id, eventId: 'dead-night-frame', dayKey: 'frame' })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) throw new AppError(409, ERROR_CODES.requirement, 'Ramka już wisi');
  await pay(
    db,
    character.id,
    'wax',
    -EVENT_FRAME_COST,
    `event-frame:${character.id}`,
    'event.frame',
  );
  const cosmetics = character.cosmetics.includes(EVENT_FRAME_ID)
    ? character.cosmetics
    : [...character.cosmetics, EVENT_FRAME_ID];
  await db.update(characters).set({ cosmetics }).where(eq(characters.id, character.id));
  await audit(db, who, character.id, 'event.buy', { sku });
  return { sku, left: 0 };
}

export async function buyCosmetic(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  cosmeticId: string,
) {
  const item = findCosmetic(cosmeticId);
  if (!item) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej kosmetyki');
  if (character.cosmetics.includes(item.id)) {
    throw new AppError(409, ERROR_CODES.requirement, 'To już wisi');
  }
  await pay(
    db,
    character.id,
    'pearls',
    -item.pearls,
    `cosmetic:${character.id}:${item.id}`,
    'cosmetic',
  );
  await db
    .update(characters)
    .set({ cosmetics: [...character.cosmetics, item.id] })
    .where(eq(characters.id, character.id));
  await audit(db, who, character.id, 'cosmetic.buy', { id: item.id });
  return { id: item.id };
}

export async function renameCharacter(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  name: string,
) {
  const parsed = characterNameSchema.parse(name);
  const [taken] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(sql`lower(${characters.name}) = lower(${parsed})`)
    .limit(1);
  if (taken) throw new AppError(409, ERROR_CODES.characterNameTaken, 'To imię jest już zajęte');
  await pay(
    db,
    character.id,
    'pearls',
    -RENAME_PEARLS,
    `rename:${character.id}:${parsed}`,
    'rename',
  );
  await db.update(characters).set({ name: parsed }).where(eq(characters.id, character.id));
  await audit(db, who, character.id, 'character.rename', { name: parsed });
  return { name: parsed };
}

export const deadNightWax = 10;
