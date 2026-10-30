/**
 * Kariera aktywnego F2P dzień po dniu, na tych samych funkcjach co serwer.
 *
 * Założenia ścieżki (GDD 10, wstęp i 10.3, 10.13):
 * - 560 Wigoru, z czego 250 (45%) idzie w trening: 65/65/60/60, rotowane między statystyki;
 * - reszta aktywności XP to 6 zleceń po 50 Wigoru;
 * - 8,9 klucza dziennie; postęp przy p ≥ 0,6, nadwyżka w powtórki bieżącej walki;
 * - sprzęt ×1,2 w dniu 1 liniowo do ×2,2 w dniu 400, potem bez zmian;
 * - kursy dają Erudycję w dobach 1, 2, 3, 4 i 12 (kolejność od najkrótszego);
 * - Sala Ćwiczeń od doby 5, poziom 5 około doby 20;
 * - wszystkie 10 Piętn Szkolenia, gdy tylko poziom na to pozwala.
 */
import {
  TRAINING_HALLS,
  dailyTaskExperience,
  experienceToNextLevel,
  grantExperience,
  markedTrainingGain,
  missionExperience,
  portalBaseExperience,
  portalEnemyStat,
  portalEquivalentFloor,
  portalPayout,
  portalRecommendedLevel,
  trainingGainCenti,
  trainingRoomFactor,
  type PortalCoord,
} from '@game/shared';

/** Aktywny F2P, GDD 10.13. */
export const ACTIVE_KEYS_PER_DAY = 8.9;

/** p ≥ 0,6 przy `p ≈ 1 / (1 + e^(−10·(r−1)))` daje r ≈ 1,0405. */
export const PORTAL_ENTRY_RATIO = 1 + -Math.log(1 / 0.6 - 1) / 10;

export const DOMAIN_DAY_TARGETS = [11, 33, 62, 99, 137, 179, 225, 276, 330, 387, 472] as const;

/** Poziom 80 u aktywnego F2P: tabela 10.2 podaje dzień 430, proza — około 1,2 roku. */
export const LEVEL_80_DAY_TARGET = 430;

const COURSE_ERUDITION: readonly (readonly [number, number])[] = [
  [1, 50],
  [2, 100],
  [3, 200],
  [4, 350],
  [12, 500],
];

const TRAIN_PATTERN = [65, 65, 60, 60] as const;

export interface CareerDay {
  day: number;
  level: number;
  /** Jedna statystyka efektywna (bazowa × sprzęt). */
  effectiveStat: number;
}

export interface ActiveCareer {
  /** Dzień ukończenia Domen 1…11. */
  domainDays: number[];
  level80Day: number;
  samples: CareerDay[];
}

function hallGain(sumUnits: number): number {
  let gain = TRAINING_HALLS[0]?.gain ?? 4;
  for (const hall of TRAINING_HALLS) {
    if (sumUnits >= hall.requiredStatSum) gain = hall.gain;
  }
  return gain;
}

function gearMultiplier(day: number): number {
  if (day <= 1) return 1.2;
  if (day >= 400) return 2.2;
  return 1.2 + (day - 1) / 399;
}

function roomLevelOnDay(day: number): number {
  if (day < 5) return 0;
  return Math.min(5, Math.ceil(((day - 4) / 16) * 5));
}

function coordOf(index: number): PortalCoord {
  return {
    domain: Math.floor((index - 1) / 80) + 1,
    stage: Math.floor(((index - 1) % 80) / 8) + 1,
    substage: ((index - 1) % 8) + 1,
  };
}

function fightExperience(level: number, index: number, first: boolean): number {
  const coord = coordOf(index);
  const recommended = portalRecommendedLevel(coord);
  const lp = Math.min(level, recommended + 5);
  const payout = portalPayout(coord, first, true);
  return Math.round(
    (payout.experience * portalBaseExperience(lp)) / portalBaseExperience(recommended),
  );
}

/** Aktywny F2P przez co najwyżej `days` dób. Wynik jest deterministyczny. */
export function simulateActiveCareer(days = 700): ActiveCareer {
  const stats = [2_000, 2_000, 2_000, 2_000];
  let progress = { level: 1, experience: 0 };
  let cleared = 0;
  let keyBank = 0;
  let erudition = 0;
  const domainDays = Array<number>(11).fill(0);
  let level80Day = 0;
  const samples: CareerDay[] = [];
  const sampleDays = new Set([1, 7, 11, 30, 90, 180, 365, 430, 450, 472]);

  for (let day = 1; day <= days; day += 1) {
    for (const [when, amount] of COURSE_ERUDITION) {
      if (when === day) erudition += amount;
    }
    const marks = Math.min(10, Math.max(0, progress.level - 59));
    const sumUnits = stats.reduce((total, stat) => total + stat, 0) / 100;
    const gain = hallGain(sumUnits) * trainingRoomFactor(roomLevelOnDay(day));
    const shift = (day - 1) % TRAIN_PATTERN.length;
    for (let index = 0; index < stats.length; index += 1) {
      const vigor = TRAIN_PATTERN[(index + shift) % TRAIN_PATTERN.length] ?? 60;
      const current = stats[index] ?? 0;
      const raw = trainingGainCenti(current, vigor, gain, erudition);
      stats[index] = current + markedTrainingGain(raw, marks);
    }
    const effective = ((stats[0] ?? 0) / 100) * gearMultiplier(day);
    if (sampleDays.has(day)) {
      samples.push({ day, level: progress.level, effectiveStat: Math.round(effective) });
    }

    keyBank += ACTIVE_KEYS_PER_DAY;
    let today = Math.floor(keyBank + 1e-9);
    keyBank -= today;
    let portalXp = 0;
    while (
      today > 0 &&
      cleared < 880 &&
      effective >=
        portalEnemyStat(portalEquivalentFloor(cleared + 1), 'minion') * PORTAL_ENTRY_RATIO
    ) {
      cleared += 1;
      today -= 1;
      portalXp += fightExperience(progress.level, cleared, true);
    }
    if (today > 0 && cleared > 0) {
      while (today > 0) {
        today -= 1;
        portalXp += fightExperience(progress.level, cleared, false);
      }
    }
    for (let domain = 0; domain < domainDays.length; domain += 1) {
      if (domainDays[domain] === 0 && cleared >= 80 * (domain + 1)) domainDays[domain] = day;
    }

    const missionXp = 6 * missionExperience(50, progress.level, 0);
    const daily =
      progress.level < 80 ? dailyTaskExperience(experienceToNextLevel(progress.level)) : 0;
    progress = grantExperience(progress, missionXp + portalXp + daily);
    if (level80Day === 0 && progress.level >= 80) level80Day = day;
  }

  return { domainDays, level80Day, samples };
}
