/**
 * Wiedza Zakazana, Sprawy, Kaplica, Kolegium, frakcje i tomy (GDD 11, Etap 3).
 * Rozwiązanie Sprawy zostaje w ziarnie po stronie serwera.
 */
import { randomBytes } from 'node:crypto';

import {
  AMBASSADOR_GOODS,
  AMBASSADOR_MIN_RANK,
  CASE_REWARDS,
  CHAPEL_TOIL_COST,
  ERROR_CODES,
  FACTION_ERRAND_REPUTATION,
  FACTION_ERRAND_SEAL,
  FACTION_ERRAND_TOIL,
  FACTIONS,
  HOUR_MS,
  INTERVIEW_FAMILIARITY,
  INTERVIEW_INSIGHT,
  KNOWLEDGE_MAX,
  REFORGE_DAILY_CAP,
  RESIDENTS,
  addLootKeys,
  addSigilShards,
  bestiaryPages as pagesFromKills,
  capReputation,
  courseDurationMs,
  deductionScore,
  findCourse,
  findStarNode,
  findTome,
  generateCase,
  publicCase,
  reputationRank,
  adjustResource,
  resourceMax,
  sanityInsightBonusBp,
  sanityPenaltyForScars,
  sanityTier,
  spendResource,
  tomeDurationMs,
  tomeKnowledgeGain,
  OPENING_TOME,
  tomeSanityCost,
  utcDay,
  type CaseQuestionId,
  type ChapelStat,
  type FactionId,
  type LoreHome,
} from '@game/shared';

import { writeAudit, type AuditActor } from '../audit.js';
import type { Clock } from '../clock.js';
import type { Executor } from '../db/client.js';
import { type CharacterRow, type LoreStateRow, type PortalStateRow } from '../db/schema.js';
import { AppError } from '../errors.js';
import { lockCharacter } from './activities.js';
import { grantSolvedCase, holdsTome, orderErrandBlocked } from './hearth.js';
import { assertCanAct, enterSanatorium } from './avatar.js';
import { loadLore, loreExtras, saveLore } from './lore-state.js';
import { loadPortal, materializePortal, ringOf, savePortal, withRing } from './portal-state.js';
import { loadResources, materializeAll, resourceContext, saveResources } from './resources.js';
import { InsufficientFundsError, postLedgerEntry } from './wallet.js';

const audit = (
  db: Executor,
  who: AuditActor,
  characterId: string,
  action: string,
  after: unknown,
) => writeAudit(db, who, { action, characterId, after });

function percent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.floor((100 * value) / max);
}

export function loreHomeFrom(
  row: LoreStateRow,
  portal: PortalStateRow,
  sanity: number,
  maxSanity: number,
  now: Date,
): LoreHome {
  const used = portal.reforgeDay === utcDay(now.getTime()) ? portal.reforgeCount : 0;
  return {
    knowledge: row.knowledge,
    scars: row.scars,
    madnessUi: row.madnessUi,
    sanityTier: sanityTier(sanity, maxSanity),
    caseOpen: row.caseStatus === 'open',
    residents: row.residents.filter((resident) => !resident.gone).length,
    reforgeLeft: Math.max(0, REFORGE_DAILY_CAP - used),
    colourSigils: portal.sigils['3'] ?? 0,
    collegeEndsAt: row.courseEndsAt ? row.courseEndsAt.toISOString() : null,
    readingEndsAt: row.readingEndsAt ? row.readingEndsAt.toISOString() : null,
    composure: row.composure,
    insight: row.insight,
    stealth: row.stealth,
  };
}

async function ready(db: Executor, character: CharacterRow, now: Date) {
  const locked = await lockCharacter(db, character.id);
  await assertCanAct(db, locked, now);
  const lore = await loadLore(db, locked.id, true);
  const extras = loreExtras(lore);
  const ctx = resourceContext(locked.level, extras.knowledge, extras.sanityPenalty);
  const resources = materializeAll(
    await loadResources(db, locked.id, { forUpdate: true }),
    ctx,
    now,
  );
  return { locked, lore, ctx, resources };
}

function caseBody(row: LoreStateRow, sanityPercent: number) {
  if (row.caseStatus !== 'open' || !row.caseSeed) return null;
  const blueprint = generateCase(row.caseSeed);
  return {
    ...publicCase(blueprint, row.caseFound, sanityPercent),
    deadlineAt: row.caseDeadline?.toISOString() ?? null,
    document: row.documentClueId
      ? { clueId: row.documentClueId, endsAt: row.documentEndsAt?.toISOString() ?? null }
      : null,
  };
}

export async function loreOf(db: Executor, character: CharacterRow, clock: Clock) {
  const now = clock.now();
  const lore = await loadLore(db, character.id);
  const extras = loreExtras(lore);
  const ctx = resourceContext(character.level, extras.knowledge, extras.sanityPenalty);
  const resources = materializeAll(await loadResources(db, character.id), ctx, now);
  const portal = materializePortal(await loadPortal(db, character.id), now);
  const ratio = percent(resources.sanity.value, resourceMax('sanity', ctx));
  return {
    knowledge: lore.knowledge,
    scars: lore.scars,
    madnessUi: lore.madnessUi,
    tier: sanityTier(resources.sanity.value, resourceMax('sanity', ctx)),
    residents: lore.residents.map((resident) => ({
      ...resident,
      name: RESIDENTS.find((entry) => entry.id === resident.id)?.name ?? resident.id,
    })),
    unrestUntil: lore.unrestUntil?.toISOString() ?? null,
    case: caseBody(lore, ratio),
    reading: lore.readingId
      ? { tomeId: lore.readingId, endsAt: lore.readingEndsAt?.toISOString() ?? null }
      : null,
    booksRead: lore.booksRead,
    college: {
      courseId: lore.courseId,
      endsAt: lore.courseEndsAt?.toISOString() ?? null,
      done: lore.coursesDone,
    },
    constellation: {
      nodes: lore.constellation,
      points: Math.max(0, character.level - lore.constellation.length),
      extinctOpen: lore.extinctOpen,
    },
    chapel: { composure: lore.composure, insight: lore.insight, stealth: lore.stealth },
    factions: FACTIONS.map((faction) => ({
      id: faction.id,
      name: faction.name,
      reputation: lore.reputation[faction.id] ?? 0,
      rank: reputationRank(lore.reputation[faction.id] ?? 0),
      seals: lore.seals[faction.id] ?? 0,
    })),
    goods: AMBASSADOR_GOODS.map((good) => ({ ...good })),
    bestiaryPages: Object.values(lore.bestiary).reduce(
      (sum, kills) => sum + pagesFromKills(kills),
      0,
    ),
    sigils: portal.sigils,
    home: loreHomeFrom(lore, portal, resources.sanity.value, resourceMax('sanity', ctx), now),
  };
}

function bumpReputation(row: LoreStateRow, faction: FactionId, gain: number): LoreStateRow {
  const current = row.reputation[faction] ?? 0;
  const value = capReputation(faction, current + gain, row.reputation);
  return { ...row, reputation: { ...row.reputation, [faction]: value } };
}

async function failOpenCase(
  db: Executor,
  who: AuditActor,
  row: LoreStateRow,
  now: Date,
): Promise<LoreStateRow> {
  const seed = row.caseSeed;
  const blueprint = seed ? generateCase(seed) : null;
  const whoClue = blueprint?.clues.find(
    (clue) => clue.source === 'interview' && clue.question === 'who',
  );
  const residents = row.residents.map((resident) =>
    resident.id === whoClue?.residentId ? { ...resident, gone: true } : resident,
  );
  const next: LoreStateRow = {
    ...row,
    residents,
    caseStatus: 'failed',
    caseSeed: null,
    caseFound: [],
    caseDeadline: null,
    documentClueId: null,
    documentEndsAt: null,
    unrestUntil: new Date(now.getTime() + 24 * HOUR_MS),
  };
  await saveLore(db, next);
  await audit(db, who, row.characterId, 'case.fail', { resident: whoClue?.residentId ?? null });
  return next;
}

/** Spisek loży: to samo śledztwo, ziarno z przedrostkiem, nagroda 2 Sigile (GDD 5.12.5). */
export async function openConspiracy(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  const { locked, lore, resources, ctx } = await ready(db, character, now);
  if (lore.caseStatus === 'open') {
    throw new AppError(409, ERROR_CODES.activityBusy, 'Masz już otwartą Sprawę');
  }
  const seed = `conspiracy:${randomBytes(16).toString('base64url')}`;
  const blueprint = generateCase(seed);
  const next: LoreStateRow = {
    ...lore,
    caseSeed: seed,
    caseFound: [],
    caseStatus: 'open',
    caseDeadline: new Date(now.getTime() + blueprint.deadlineHours * HOUR_MS),
    documentClueId: null,
    documentEndsAt: null,
  };
  await saveLore(db, next);
  await audit(db, who, locked.id, 'case.conspiracy', { god: blueprint.god });
  return {
    case: caseBody(next, percent(resources.sanity.value, resourceMax('sanity', ctx))),
  };
}

export async function openCase(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  const { locked, lore, resources, ctx } = await ready(db, character, now);
  if (lore.caseStatus === 'open') {
    throw new AppError(409, ERROR_CODES.activityBusy, 'Masz już otwartą Sprawę');
  }
  const seed = randomBytes(16).toString('base64url');
  const blueprint = generateCase(seed);
  const next: LoreStateRow = {
    ...lore,
    caseSeed: seed,
    caseFound: [],
    caseStatus: 'open',
    caseDeadline: new Date(now.getTime() + blueprint.deadlineHours * HOUR_MS),
    documentClueId: null,
    documentEndsAt: null,
  };
  await saveLore(db, next);
  await audit(db, who, locked.id, 'case.open', { scale: blueprint.scale });
  return {
    case: caseBody(next, percent(resources.sanity.value, resourceMax('sanity', ctx))),
  };
}

export async function takeClue(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  clueId: string,
) {
  const now = clock.now();
  const state = await ready(db, character, now);
  let { lore } = state;
  const { locked, ctx } = state;
  let { resources } = state;
  if (lore.caseStatus !== 'open' || !lore.caseSeed) {
    throw new AppError(409, ERROR_CODES.requirement, 'Nie masz otwartej Sprawy');
  }
  if (lore.caseDeadline && lore.caseDeadline <= now) {
    await failOpenCase(db, who, lore, now);
    return { expired: true, case: null };
  }
  const blueprint = generateCase(lore.caseSeed);
  const ratio = percent(resources.sanity.value, resourceMax('sanity', ctx));
  const visible = publicCase(blueprint, lore.caseFound, ratio);
  if (!visible.clues.some((clue) => clue.id === clueId)) {
    throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego tropu');
  }
  const clue = blueprint.clues.find((entry) => entry.id === clueId);
  if (!clue || lore.caseFound.includes(clueId)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ten trop jest już w notatniku');
  }
  if (clue.knowledge > lore.knowledge) {
    throw new AppError(409, ERROR_CODES.requirement, 'Za mało Wiedzy Zakazanej');
  }
  if (clue.waitMs > 0) {
    if (lore.documentClueId) {
      throw new AppError(409, ERROR_CODES.activityBusy, 'Jeden dokument naraz');
    }
    lore = {
      ...lore,
      documentClueId: clue.id,
      documentEndsAt: new Date(now.getTime() + clue.waitMs),
    };
    await saveLore(db, lore);
    await audit(db, who, locked.id, 'case.document', { clueId });
    return { expired: false, case: caseBody(lore, ratio) };
  }
  if (clue.toil > 0) {
    const spent = spendResource(
      'toil',
      resources.toil,
      now.getTime(),
      resourceMax('toil', ctx),
      clue.toil,
    );
    if (!spent) throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Znoju');
    resources = { ...resources, toil: spent };
  }
  let revealed = true;
  if (clue.source === 'interview') {
    const resident = lore.residents.find((entry) => entry.id === clue.residentId);
    if (!resident || resident.gone) {
      throw new AppError(409, ERROR_CODES.requirement, 'Tego Mieszkańca już nie ma');
    }
    const insight =
      lore.insight +
      Math.round(
        sanityInsightBonusBp(sanityTier(resources.sanity.value, resourceMax('sanity', ctx))) /
          1_000,
      );
    if (resident.familiarity < INTERVIEW_FAMILIARITY && insight < INTERVIEW_INSIGHT) {
      revealed = false;
    } else {
      lore = {
        ...lore,
        residents: lore.residents.map((entry) =>
          entry.id === resident.id
            ? { ...entry, familiarity: Math.min(100, entry.familiarity + 10) }
            : entry,
        ),
      };
    }
  }
  if (clue.sanity > 0) {
    resources = {
      ...resources,
      sanity: adjustResource(
        'sanity',
        resources.sanity,
        now.getTime(),
        resourceMax('sanity', ctx),
        -clue.sanity,
      ),
    };
  }
  if (revealed) lore = { ...lore, caseFound: [...lore.caseFound, clue.id] };
  await saveLore(db, lore);
  if (resources.sanity.value <= 0) {
    resources = await enterSanatorium(db, locked, resources, now);
  } else {
    await saveResources(db, locked.id, resources);
  }
  await audit(db, who, locked.id, 'case.clue', { clueId, revealed });
  return {
    expired: false,
    revealed,
    case: caseBody(lore, percent(resources.sanity.value, resourceMax('sanity', ctx))),
  };
}

export async function claimDocument(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  const { locked, lore } = await ready(db, character, now);
  if (!lore.documentClueId || !lore.documentEndsAt) {
    throw new AppError(409, ERROR_CODES.requirement, 'Żaden dokument nie leży na pulpicie');
  }
  if (lore.documentEndsAt > now) {
    throw new AppError(409, ERROR_CODES.activityNotReady, 'Tłumaczenie jeszcze trwa');
  }
  const next: LoreStateRow = {
    ...lore,
    caseFound: lore.caseFound.includes(lore.documentClueId)
      ? lore.caseFound
      : [...lore.caseFound, lore.documentClueId],
    documentClueId: null,
    documentEndsAt: null,
  };
  await saveLore(db, next);
  await audit(db, who, locked.id, 'case.document.claim', {});
  const resources = materializeAll(
    await loadResources(db, locked.id),
    resourceContext(locked.level, next.knowledge, sanityPenaltyForScars(next.scars)),
    now,
  );
  return {
    case: caseBody(
      next,
      percent(
        resources.sanity.value,
        resourceMax(
          'sanity',
          resourceContext(locked.level, next.knowledge, sanityPenaltyForScars(next.scars)),
        ),
      ),
    ),
  };
}

export async function deduceCase(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  answers: Record<CaseQuestionId, number>,
) {
  const now = clock.now();
  const state = await ready(db, character, now);
  let { lore, resources } = state;
  const { locked, ctx } = state;
  if (lore.caseStatus !== 'open' || !lore.caseSeed) {
    throw new AppError(409, ERROR_CODES.requirement, 'Nie masz otwartej Sprawy');
  }
  if (lore.caseDeadline && lore.caseDeadline <= now) {
    await failOpenCase(db, who, lore, now);
    return { score: 0, status: 'failed' as const };
  }
  const blueprint = generateCase(lore.caseSeed);
  const score = deductionScore(blueprint, answers);
  if (score <= 1) {
    await failOpenCase(db, who, lore, now);
    return { score, status: 'failed' as const };
  }
  const portal = materializePortal(await loadPortal(db, locked.id, true), now);
  if (score === 3) {
    const reward = CASE_REWARDS[blueprint.scale];
    lore = bumpReputation(lore, 'order', reward.reputation);
    lore = {
      ...lore,
      knowledge: Math.min(KNOWLEDGE_MAX, lore.knowledge + reward.knowledge),
      caseStatus: 'solved',
      caseSeed: null,
      caseFound: [],
      caseDeadline: null,
      documentClueId: null,
      documentEndsAt: null,
    };
    let ring = ringOf(portal);
    if (reward.keys > 0) ring = addLootKeys(ring, reward.keys);
    let nextPortal = withRing(portal, ring, now);
    if (reward.sigilShards > 0) {
      const exchanged = addSigilShards(
        nextPortal.sigilShards,
        nextPortal.sigils,
        blueprint.god,
        reward.sigilShards,
      );
      nextPortal = { ...nextPortal, sigilShards: exchanged.shards, sigils: exchanged.sigils };
    }
    if (reward.ichor > 0) nextPortal = { ...nextPortal, ichor: nextPortal.ichor + reward.ichor };
    if (reward.sigils > 0) {
      const key = String(blueprint.god);
      nextPortal = {
        ...nextPortal,
        sigils: { ...nextPortal.sigils, [key]: (nextPortal.sigils[key] ?? 0) + reward.sigils },
      };
    }
    await savePortal(db, nextPortal);
    await grantSolvedCase(db, locked.id);
  } else {
    lore = bumpReputation(lore, 'order', CASE_REWARDS.partial.reputation);
    lore = {
      ...lore,
      caseStatus: 'partial',
      caseSeed: null,
      caseFound: [],
      caseDeadline: null,
      documentClueId: null,
      documentEndsAt: null,
    };
    await postLedgerEntry(db, {
      characterId: locked.id,
      currency: 'silver',
      delta: CASE_REWARDS.partial.silver,
      reason: 'case.partial',
      idempotencyKey: `case-partial:${locked.id}:${now.toISOString()}`,
    });
  }
  const maxSanity = resourceMax('sanity', {
    ...ctx,
    knowledge: lore.knowledge,
    sanityPenalty: sanityPenaltyForScars(lore.scars),
  });
  if (resources.sanity.value > maxSanity) {
    resources = { ...resources, sanity: { value: maxSanity, updatedAt: now.getTime() } };
  }
  await saveLore(db, lore);
  await saveResources(db, locked.id, resources);
  await audit(db, who, locked.id, 'case.deduce', { score });
  return { score, status: lore.caseStatus };
}

export async function startReading(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  tomeId: string,
) {
  const now = clock.now();
  const { locked, lore } = await ready(db, character, now);
  const tome = findTome(tomeId);
  if (!tome) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego tomu');
  if (lore.readingId) throw new AppError(409, ERROR_CODES.activityBusy, 'Jeden tom naraz');
  if (lore.booksRead.includes(tome.id)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ten tom jest już przeczytany');
  }
  if (tome.domain !== null && lore.knowledge < 3 * (tome.domain - 1)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Za mało Wiedzy Zakazanej');
  }
  if (tome.id === OPENING_TOME && !(await holdsTome(db, locked.id, tome.id))) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ten tom leży przy Sprawie, nie na półce');
  }
  const next = {
    ...lore,
    readingId: tome.id,
    readingEndsAt: new Date(now.getTime() + tomeDurationMs(tome)),
  };
  await saveLore(db, next);
  await audit(db, who, locked.id, 'tome.start', { tomeId });
  return { tomeId, endsAt: next.readingEndsAt.toISOString() };
}

export async function claimReading(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  const state = await ready(db, character, now);
  const { locked, ctx } = state;
  let { lore, resources } = state;
  if (!lore.readingId || !lore.readingEndsAt) {
    throw new AppError(409, ERROR_CODES.requirement, 'Nic nie czytasz');
  }
  if (lore.readingEndsAt > now) {
    throw new AppError(409, ERROR_CODES.activityNotReady, 'Lektura jeszcze trwa');
  }
  const tome = findTome(lore.readingId);
  if (!tome) throw new AppError(404, ERROR_CODES.notFound, 'Tom zniknął z półki');
  lore = {
    ...lore,
    knowledge: Math.min(
      KNOWLEDGE_MAX,
      lore.knowledge + tomeKnowledgeGain(tome.knowledge, lore.knowledge),
    ),
    booksRead: [...lore.booksRead, tome.id],
    extinctOpen: lore.extinctOpen || tome.extinct,
    readingId: null,
    readingEndsAt: null,
  };
  const portal = await loadPortal(db, locked.id, true);
  if (tome.domain !== null) {
    const key = String(tome.domain);
    await savePortal(db, {
      ...portal,
      sigils: { ...portal.sigils, [key]: (portal.sigils[key] ?? 0) + 1 },
    });
  }
  const maxSanity = resourceMax('sanity', {
    ...ctx,
    knowledge: lore.knowledge,
    sanityPenalty: sanityPenaltyForScars(lore.scars),
  });
  resources = {
    ...resources,
    sanity: adjustResource(
      'sanity',
      resources.sanity,
      now.getTime(),
      maxSanity,
      -tomeSanityCost(tome),
    ),
  };
  if (resources.sanity.value > maxSanity) {
    resources = { ...resources, sanity: { value: maxSanity, updatedAt: now.getTime() } };
  }
  await saveLore(db, lore);
  if (resources.sanity.value <= 0) await enterSanatorium(db, locked, resources, now);
  else await saveResources(db, locked.id, resources);
  await audit(db, who, locked.id, 'tome.claim', { tomeId: tome.id });
  return { knowledge: lore.knowledge, tomeId: tome.id };
}

export async function startCourse(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  courseId: string,
) {
  const now = clock.now();
  const { locked, lore } = await ready(db, character, now);
  const course = findCourse(courseId);
  if (!course) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego kursu');
  if (lore.courseId) throw new AppError(409, ERROR_CODES.activityBusy, 'Jeden kurs naraz');
  if (lore.coursesDone.includes(course.id)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ten kurs jest już zaliczony');
  }
  try {
    await postLedgerEntry(db, {
      characterId: locked.id,
      currency: 'silver',
      delta: -course.silver,
      reason: 'college.course',
      idempotencyKey: `college:${locked.id}:${course.id}`,
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało srebra na czesne');
    }
    throw error;
  }
  const next = {
    ...lore,
    courseId: course.id,
    courseEndsAt: new Date(now.getTime() + courseDurationMs(course.hours)),
  };
  await saveLore(db, next);
  await audit(db, who, locked.id, 'college.start', { courseId });
  return { courseId, endsAt: next.courseEndsAt.toISOString() };
}

export async function claimCourse(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
) {
  const now = clock.now();
  const { locked, lore } = await ready(db, character, now);
  if (!lore.courseId || !lore.courseEndsAt) {
    throw new AppError(409, ERROR_CODES.requirement, 'Nie chodzisz na kurs');
  }
  if (lore.courseEndsAt > now) {
    throw new AppError(409, ERROR_CODES.activityNotReady, 'Kurs jeszcze trwa');
  }
  const done = lore.courseId;
  const next = {
    ...lore,
    coursesDone: [...lore.coursesDone, done],
    courseId: null,
    courseEndsAt: null,
  };
  await saveLore(db, next);
  await audit(db, who, locked.id, 'college.claim', { courseId: done });
  return { done: next.coursesDone };
}

export async function unlockConstellation(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  nodeId: string,
) {
  const now = clock.now();
  const { locked, lore } = await ready(db, character, now);
  const node = findStarNode(nodeId);
  if (!node) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiej gwiazdy');
  if (lore.constellation.includes(node.id)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ta gwiazda już świeci');
  }
  if (node.excludes && lore.constellation.includes(node.excludes)) {
    throw new AppError(409, ERROR_CODES.requirement, 'Te gwiazdy wykluczają się');
  }
  if (node.extinct && !lore.extinctOpen) {
    throw new AppError(409, ERROR_CODES.requirement, 'Wygasłą gwiazdę odsłania dopiero tom');
  }
  if (lore.constellation.length >= locked.level) {
    throw new AppError(409, ERROR_CODES.requirement, 'Brak punktu Konstelacji');
  }
  try {
    await postLedgerEntry(db, {
      characterId: locked.id,
      currency: 'silver',
      delta: -node.silver,
      reason: 'constellation.node',
      idempotencyKey: `star:${locked.id}:${node.id}`,
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało srebra na gwiazdę');
    }
    throw error;
  }
  const next = { ...lore, constellation: [...lore.constellation, node.id] };
  await saveLore(db, next);
  await audit(db, who, locked.id, 'constellation.unlock', { nodeId });
  return { nodes: next.constellation };
}

export async function trainChapel(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  stat: ChapelStat,
) {
  const now = clock.now();
  const state = await ready(db, character, now);
  const { locked, ctx, lore } = state;
  let { resources } = state;
  const spent = spendResource(
    'toil',
    resources.toil,
    now.getTime(),
    resourceMax('toil', ctx),
    CHAPEL_TOIL_COST,
  );
  if (!spent) throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Znoju');
  resources = { ...resources, toil: spent };
  const next = { ...lore, [stat]: lore[stat] + 1 };
  await saveLore(db, next);
  await saveResources(db, locked.id, resources);
  await audit(db, who, locked.id, 'chapel.train', { stat });
  return { composure: next.composure, insight: next.insight, stealth: next.stealth };
}

export async function runErrand(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  faction: FactionId,
) {
  const now = clock.now();
  const state = await ready(db, character, now);
  const { locked, ctx } = state;
  let { lore, resources } = state;
  if (!FACTIONS.some((entry) => entry.id === faction)) {
    throw new AppError(400, ERROR_CODES.validation, 'Nieznana frakcja');
  }
  if (faction === 'order' && (await orderErrandBlocked(db, locked.id, now))) {
    throw new AppError(409, ERROR_CODES.requirement, 'Zakon nie daje zleceń zdemaskowanym');
  }
  const spent = spendResource(
    'toil',
    resources.toil,
    now.getTime(),
    resourceMax('toil', ctx),
    FACTION_ERRAND_TOIL,
  );
  if (!spent) throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Znoju');
  resources = { ...resources, toil: spent };
  lore = bumpReputation(lore, faction, FACTION_ERRAND_REPUTATION);
  lore = {
    ...lore,
    seals: { ...lore.seals, [faction]: (lore.seals[faction] ?? 0) + FACTION_ERRAND_SEAL },
  };
  await saveLore(db, lore);
  await saveResources(db, locked.id, resources);
  await audit(db, who, locked.id, 'faction.errand', { faction });
  return { reputation: lore.reputation[faction] ?? 0, seals: lore.seals[faction] ?? 0 };
}

export async function buyAmbassadorGood(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  clock: Clock,
  goodId: string,
) {
  const now = clock.now();
  const { locked, lore } = await ready(db, character, now);
  const good = AMBASSADOR_GOODS.find((entry) => entry.id === goodId);
  if (!good) throw new AppError(404, ERROR_CODES.notFound, 'Ambasador tego nie wozi');
  const rank = reputationRank(lore.reputation[good.faction] ?? 0);
  if (rank < AMBASSADOR_MIN_RANK) {
    throw new AppError(409, ERROR_CODES.requirement, 'Ambasador jeszcze cię nie zna');
  }
  const seals = lore.seals[good.faction] ?? 0;
  if (seals < good.seals) {
    throw new AppError(409, ERROR_CODES.requirement, 'Za mało Pieczęci');
  }
  const next = {
    ...lore,
    seals: { ...lore.seals, [good.faction]: seals - good.seals },
    stealth: good.id === 'lockpick' ? lore.stealth + 1 : lore.stealth,
  };
  await saveLore(db, next);
  if (good.id === 'candle') {
    const portal = await loadPortal(db, locked.id, true);
    await savePortal(db, { ...portal, candles: portal.candles + 1 });
  } else if (good.id === 'pass' || good.id === 'crate') {
    await postLedgerEntry(db, {
      characterId: locked.id,
      currency: 'silver',
      delta: good.id === 'crate' ? 50 : 20,
      reason: 'ambassador.good',
      refId: good.id,
      idempotencyKey: `ambassador:${locked.id}:${good.id}:${now.toISOString()}`,
    });
  }
  await audit(db, who, locked.id, 'ambassador.buy', { goodId });
  return { goodId, seals: next.seals[good.faction] ?? 0 };
}

export async function setMadnessUi(
  db: Executor,
  who: AuditActor,
  character: CharacterRow,
  enabled: boolean,
) {
  const locked = await lockCharacter(db, character.id);
  const lore = await loadLore(db, locked.id, true);
  const next = { ...lore, madnessUi: enabled };
  await saveLore(db, next);
  await audit(db, who, locked.id, 'madness.ui', { enabled });
  return { madnessUi: next.madnessUi };
}
