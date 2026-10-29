/**
 * Aktywności z timerem (GDD 8.2 `TimedActivity`, 8.3). Klient wysyła tylko intencję
 * („rozpocznij”, „odbierz”); koszt, czas, ziarno i nagrody ustala serwer.
 */
import { randomBytes } from 'node:crypto';

import {
  BALANCE_VERSION,
  COUNTING_CHANCE_BONUS_BP,
  COUNTING_DURATION_BONUS_BP,
  ERROR_CODES,
  MISSION_MAX_LOOPS,
  computeLoadout,
  DEEPENING_MAX,
  deepenedRequirement,
  findMission,
  unlockedPortalGods,
  adjustResource,
  grantClassExperience,
  grantExperience,
  missionTier,
  resourceMax,
  resolveMission,
  spendResource,
  travelInProgress,
  type Activity,
  type ClaimResponse,
  type MissionResult,
  type StartActivityResponse,
} from '@game/shared';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';

import { writeAudit, type AuditActor } from '../audit.js';
import type { Clock } from '../clock.js';
import type { Executor } from '../db/client.js';
import {
  characters,
  classProgress,
  missionProgress,
  timedActivities,
  type TimedActivityRow,
} from '../db/schema.js';
import { AppError, uniqueViolationConstraint } from '../errors.js';
import { toCharacterDto } from '../serializers.js';
import {
  assertCanAct,
  enterHospital,
  enterSanatorium,
  equippedOf,
  missionSnapshot,
} from './avatar.js';
import { loadLore, loreExtras } from './lore-state.js';
import { loadWorld } from './world-state.js';
import {
  loadResources,
  materializeAll,
  resourceContext,
  saveResources,
  toResourcesDto,
} from './resources.js';
import { grantMissionShards, grantSigilShards, loadPortal } from './portal-state.js';
import { postLedgerEntry, walletOf } from './wallet.js';

type Tx = Executor;

export interface GameDeps {
  db: Executor;
  clock: Clock;
}

const OPEN_STATUSES = ['active', 'completed'] as const;

export function toActivityDto(row: TimedActivityRow): Activity {
  const result = row.status === 'active' ? null : row.result;
  return {
    id: row.id,
    type: 'mission',
    defId: row.defId,
    status: row.status,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    result: result
      ? {
          experience: result.experience,
          silver: result.silver,
          outcome: result.outcome,
          success: result.success,
          lifeLoss: result.lifeLoss,
          sanityLoss: result.sanityLoss,
        }
      : null,
  };
}

export async function lockCharacter(tx: Tx, characterId: string) {
  const [character] = await tx
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .for('update');
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Nie znaleziono postaci');
  return character;
}

/** Wynik zależy wyłącznie od definicji, poziomu z chwili startu i ziarna. */
function computeResult(row: TimedActivityRow): MissionResult {
  const mission = findMission(row.defId);
  if (!mission) throw new Error(`Brak definicji zlecenia ${row.defId} w danych statycznych`);
  return resolveMission({
    mission,
    level: row.payload.level,
    seed: row.resultSeed,
    chanceBp: row.payload.chanceBp,
    maxLife: row.payload.maxLife,
  });
}

export async function startMission(
  { db, clock }: GameDeps,
  who: AuditActor,
  characterId: string,
  missionId: string,
  loop = false,
): Promise<StartActivityResponse> {
  const mission = findMission(missionId);
  if (!mission) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego zlecenia');
  const tier = missionTier(mission.tierId);

  try {
    return await db.transaction(async (tx) => {
      const now = clock.now();
      const character = await lockCharacter(tx, characterId);
      await assertCanAct(tx, character, now);
      const journey = await loadWorld(tx, characterId, true);
      if (
        travelInProgress(journey.travelTo, journey.travelEndsAt?.getTime() ?? null, now.getTime())
      ) {
        throw new AppError(409, ERROR_CODES.activityBusy, 'W podróży nie bierzesz zleceń');
      }
      const lore = await loadLore(tx, characterId);
      const extras = loreExtras(lore);
      const ctx = resourceContext(character.level, extras.knowledge, extras.sanityPenalty);
      const [known] = await tx
        .select()
        .from(missionProgress)
        .where(
          and(
            eq(missionProgress.characterId, characterId),
            eq(missionProgress.missionId, mission.id),
          ),
        )
        .limit(1);
      const nextLoop = loop ? (known?.loops ?? 0) + 1 : 1;
      if (loop && (known?.loops ?? 0) >= MISSION_MAX_LOOPS) {
        throw new AppError(409, ERROR_CODES.loopFinished, 'Pętla tego zlecenia dobiegła końca');
      }
      const degree = known?.deepening ?? 0;
      const snapshot = await missionSnapshot(
        tx,
        character,
        mission,
        deepenedRequirement(tier.requiredStat, degree),
        known?.successes ?? 0,
      );
      let chanceBp = snapshot.chanceBp;
      let durationMs = tier.durationMs;
      if (lore.scars.includes('counting')) {
        chanceBp = Math.min(10_000, chanceBp + COUNTING_CHANCE_BONUS_BP);
        durationMs = Math.round(durationMs * (1 + COUNTING_DURATION_BONUS_BP / 10_000));
      }

      const [open] = await tx
        .select({ id: timedActivities.id })
        .from(timedActivities)
        .where(
          and(
            eq(timedActivities.characterId, characterId),
            eq(timedActivities.type, 'mission'),
            inArray(timedActivities.status, OPEN_STATUSES),
          ),
        )
        .limit(1);
      if (open) {
        throw new AppError(409, ERROR_CODES.activityBusy, 'Najpierw odbierz bieżące zlecenie');
      }

      const stored = await loadResources(tx, characterId, { forUpdate: true });
      const current = materializeAll(stored, ctx, now);
      const vigor = spendResource(
        'vigor',
        current.vigor,
        now.getTime(),
        resourceMax('vigor', ctx),
        tier.vigorCost,
      );
      if (!vigor) {
        throw new AppError(409, ERROR_CODES.insufficientResources, 'Za mało Wigoru');
      }
      const next = { ...current, vigor };
      await saveResources(tx, characterId, next);

      const [activity] = await tx
        .insert(timedActivities)
        .values({
          characterId,
          type: 'mission',
          defId: mission.id,
          payload: {
            level: character.level,
            vigorCost: tier.vigorCost,
            chanceBp,
            maxLife: snapshot.maxLife,
            loop: nextLoop,
            deepening: degree,
          },
          status: 'active',
          startAt: now,
          endAt: new Date(now.getTime() + durationMs),
          resultSeed: randomBytes(16).toString('base64url'),
          balanceVersion: BALANCE_VERSION,
        })
        .returning();
      if (!activity) throw new Error('INSERT nie zwrócił aktywności');

      await tx
        .insert(missionProgress)
        .values({
          characterId,
          missionId: mission.id,
          successes: known?.successes ?? 0,
          loops: nextLoop,
        })
        .onConflictDoUpdate({
          target: [missionProgress.characterId, missionProgress.missionId],
          set: { loops: nextLoop },
        });
      await writeAudit(tx, who, {
        action: 'activity.start',
        characterId,
        before: { vigor: current.vigor.value },
        after: { vigor: vigor.value, activityId: activity.id, defId: mission.id },
      });
      return { activity: toActivityDto(activity), resources: toResourcesDto(next, ctx) };
    });
  } catch (error) {
    if (uniqueViolationConstraint(error) === 'timed_activities_one_open_per_type') {
      throw new AppError(409, ERROR_CODES.activityBusy, 'Najpierw odbierz bieżące zlecenie');
    }
    throw error;
  }
}

/**
 * Rozstrzyga zakończone aktywności (status `active`, `endAt ≤ teraz`). Wywołuje to
 * worker co minutę oraz pulpit gracza. `SKIP LOCKED` pozwala działać wielu workerom.
 */
export async function resolveDueActivities(
  { db, clock }: GameDeps,
  options: { characterId?: string; limit?: number } = {},
): Promise<{ activity: TimedActivityRow; accountId: string }[]> {
  return db.transaction(async (tx) => {
    const now = clock.now();
    const due = await tx
      .select()
      .from(timedActivities)
      .where(
        and(
          eq(timedActivities.status, 'active'),
          lte(timedActivities.endAt, now),
          options.characterId ? eq(timedActivities.characterId, options.characterId) : undefined,
        ),
      )
      .orderBy(asc(timedActivities.endAt))
      .limit(options.limit ?? 200)
      .for('update', { skipLocked: true });

    const resolved: { activity: TimedActivityRow; accountId: string }[] = [];
    for (const row of due) {
      const [updated] = await tx
        .update(timedActivities)
        .set({ status: 'completed', result: computeResult(row), resolvedAt: now })
        .where(eq(timedActivities.id, row.id))
        .returning();
      const [owner] = await tx
        .select({ accountId: characters.accountId })
        .from(characters)
        .where(eq(characters.id, row.characterId));
      if (updated && owner) resolved.push({ activity: updated, accountId: owner.accountId });
    }
    return resolved;
  });
}

/**
 * Odbiór nagród: jedna aktywność (`activityId`) albo wszystkie gotowe (`'all'`).
 * Srebro trafia do księgi z kluczem `activity:<id>:reward`, więc nawet ponowione
 * rozliczenie nie wypłaci go dwa razy.
 */
export async function claimActivities(
  { db, clock }: GameDeps,
  who: AuditActor,
  characterId: string,
  target: { activityId: string } | 'all',
): Promise<ClaimResponse> {
  return db.transaction(async (tx) => {
    const now = clock.now();
    const character = await lockCharacter(tx, characterId);

    const rows = await tx
      .select()
      .from(timedActivities)
      .where(
        and(
          eq(timedActivities.characterId, characterId),
          target === 'all'
            ? inArray(timedActivities.status, OPEN_STATUSES)
            : eq(timedActivities.id, target.activityId),
        ),
      )
      .for('update');

    if (target !== 'all') {
      const [row] = rows;
      if (!row) throw new AppError(404, ERROR_CODES.notFound, 'Nie znaleziono aktywności');
      if (row.status === 'claimed') {
        throw new AppError(409, ERROR_CODES.activityAlreadyClaimed, 'Nagroda została już odebrana');
      }
      if (row.status === 'active' && row.endAt > now) {
        throw new AppError(409, ERROR_CODES.activityNotReady, 'Zlecenie jeszcze trwa');
      }
    }

    const ready = rows.filter(
      (row) => row.status === 'completed' || (row.status === 'active' && row.endAt <= now),
    );

    const before = { level: character.level, experience: character.experience };
    const walletBefore = await walletOf(tx, characterId);
    let totalExperience = 0;
    const claimed: TimedActivityRow[] = [];
    for (const row of ready) {
      const result = row.status === 'completed' && row.result ? row.result : computeResult(row);
      totalExperience += result.experience;
      if (result.silver > 0) {
        await postLedgerEntry(tx, {
          characterId,
          currency: 'silver',
          delta: result.silver,
          reason: 'activity.reward',
          refId: row.id,
          idempotencyKey: `activity:${row.id}:reward`,
        });
      }
      const [updated] = await tx
        .update(timedActivities)
        .set({
          status: 'claimed',
          result,
          resolvedAt: row.resolvedAt ?? now,
          claimedAt: now,
        })
        .where(eq(timedActivities.id, row.id))
        .returning();
      if (updated) claimed.push(updated);
      if (result.success) {
        const mission = findMission(row.defId);
        if (mission) {
          await grantMissionShards(tx, characterId, mission.tierId, true, row.resultSeed, now);
        }
        await tx
          .update(missionProgress)
          .set({ successes: sql`${missionProgress.successes} + 1` })
          .where(
            and(
              eq(missionProgress.characterId, characterId),
              eq(missionProgress.missionId, row.defId),
            ),
          );
      }
    }

    const progress = grantExperience(before, totalExperience);
    const [updatedCharacter] = await tx
      .update(characters)
      .set({ level: progress.level, experience: progress.experience })
      .where(eq(characters.id, characterId))
      .returning();
    if (!updatedCharacter) throw new Error('UPDATE nie zwrócił postaci');

    const wallet = await walletOf(tx, characterId);
    const lore = await loadLore(tx, characterId);
    const extras = loreExtras(lore);
    const ctx = resourceContext(updatedCharacter.level, extras.knowledge, extras.sanityPenalty);
    let resources = materializeAll(await loadResources(tx, characterId), ctx, now);
    for (const row of claimed) {
      const result = row.result;
      if (!result) continue;
      const maxLife = resourceMax('life', ctx);
      const maxSanity = resourceMax('sanity', ctx);
      if (!result.success) {
        resources = {
          ...resources,
          life: adjustResource('life', resources.life, now.getTime(), maxLife, -result.lifeLoss),
          sanity: adjustResource(
            'sanity',
            resources.sanity,
            now.getTime(),
            maxSanity,
            -result.sanityLoss,
          ),
        };
        if (resources.life.value <= 0) {
          resources = await enterHospital(tx, updatedCharacter, resources, now, 0);
        }
      } else if (result.sanityLoss > 0) {
        resources = {
          ...resources,
          sanity: adjustResource(
            'sanity',
            resources.sanity,
            now.getTime(),
            maxSanity,
            -result.sanityLoss,
          ),
        };
        if (resources.sanity.value <= 0) {
          resources = await enterSanatorium(tx, updatedCharacter, resources, now);
        }
      }
      if (result.success && (row.payload.deepening ?? 0) >= 4) {
        const portal = await loadPortal(tx, characterId);
        const gods = unlockedPortalGods({
          domain: portal.clearedDomain,
          stage: portal.clearedStage,
          substage: portal.clearedSubstage,
        });
        await grantSigilShards(tx, characterId, gods[gods.length - 1] ?? 1, 1, now);
      }
    }
    await saveResources(tx, characterId, resources);
    const activeClass = computeLoadout(await equippedOf(tx, characterId)).classId;
    if (totalExperience > 0 && activeClass) {
      const [klass] = await tx
        .select()
        .from(classProgress)
        .where(
          and(eq(classProgress.characterId, characterId), eq(classProgress.classId, activeClass)),
        )
        .limit(1);
      const next = grantClassExperience(
        { level: klass?.level ?? 0, experience: klass?.experience ?? 0 },
        totalExperience,
      );
      await tx
        .insert(classProgress)
        .values({ characterId, classId: activeClass, ...next })
        .onConflictDoUpdate({
          target: [classProgress.characterId, classProgress.classId],
          set: next,
        });
    }

    if (claimed.length > 0) {
      await writeAudit(tx, who, {
        action: 'activity.claim',
        characterId,
        before: { ...before, silver: walletBefore.silver },
        after: {
          level: progress.level,
          experience: progress.experience,
          silver: wallet.silver,
          activityIds: claimed.map((row) => row.id),
        },
      });
    }

    return {
      claimed: claimed.map(toActivityDto),
      character: toCharacterDto(updatedCharacter),
      wallet,
      resources: toResourcesDto(resources, ctx),
    };
  });
}

/** Aktywne i zakończone, jeszcze nieodebrane aktywności postaci. */
export async function openActivities(db: Executor, characterId: string) {
  return db
    .select()
    .from(timedActivities)
    .where(
      and(
        eq(timedActivities.characterId, characterId),
        inArray(timedActivities.status, OPEN_STATUSES),
      ),
    )
    .orderBy(asc(timedActivities.endAt));
}

/** Pogłębienie przy szansie 100% (GDD 5.9). Następny start używa progu ×1,6^stopień. */
export async function deepenMission(
  { db }: GameDeps,
  who: AuditActor,
  characterId: string,
  missionId: string,
): Promise<{ deepening: number }> {
  const mission = findMission(missionId);
  if (!mission) throw new AppError(404, ERROR_CODES.notFound, 'Nie ma takiego zlecenia');
  const tier = missionTier(mission.tierId);
  return db.transaction(async (tx) => {
    const character = await lockCharacter(tx, characterId);
    const [known] = await tx
      .select()
      .from(missionProgress)
      .where(
        and(
          eq(missionProgress.characterId, characterId),
          eq(missionProgress.missionId, mission.id),
        ),
      )
      .limit(1);
    const degree = known?.deepening ?? 0;
    if (degree >= DEEPENING_MAX) {
      throw new AppError(409, ERROR_CODES.requirement, 'Pogłębienie nie idzie już głębiej');
    }
    const snapshot = await missionSnapshot(
      tx,
      character,
      mission,
      deepenedRequirement(tier.requiredStat, degree),
      known?.successes ?? 0,
    );
    if (snapshot.chanceBp < 10_000) {
      throw new AppError(409, ERROR_CODES.requirement, 'Pogłębienie wymaga pewnego zlecenia');
    }
    const deepening = degree + 1;
    await tx
      .insert(missionProgress)
      .values({ characterId, missionId: mission.id, deepening })
      .onConflictDoUpdate({
        target: [missionProgress.characterId, missionProgress.missionId],
        set: { deepening },
      });
    await writeAudit(tx, who, {
      action: 'mission.deepen',
      characterId,
      after: { missionId, deepening },
    });
    return { deepening };
  });
}
