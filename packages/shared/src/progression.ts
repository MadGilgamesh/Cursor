/**
 * Progresja postaci — krzywa doświadczenia z GDD 1.1 (rozdz. 10.2):
 *
 *   XP_do_następnego(L) = round((63·L^2,25 + 60) · f(L)),
 *   f(L) = 0,3 dla L ≤ 5, 0,55 dla L 6–9, 1 od L 10.
 *
 * L^2,25 liczymy jako L²·√√L: mnożenie i pierwiastek kwadratowy są w IEEE 754
 * zaokrąglane dokładnie, więc wynik jest identyczny w każdym silniku JS
 * (w przeciwieństwie do `Math.pow`, którego dokładność zależy od implementacji).
 */

export const CHARACTER_START_LEVEL = 1;
export const CHARACTER_MAX_LEVEL = 80;

function earlyGameFactor(level: number): number {
  if (level <= 5) return 0.3;
  if (level <= 9) return 0.55;
  return 1;
}

function assertLevel(level: number): void {
  if (
    !Number.isSafeInteger(level) ||
    level < CHARACTER_START_LEVEL ||
    level > CHARACTER_MAX_LEVEL
  ) {
    throw new RangeError(`Niepoprawny poziom: ${level}`);
  }
}

/** Doświadczenie potrzebne, aby przejść z poziomu `level` na `level + 1` (0 na poziomie maksymalnym). */
export function experienceToNextLevel(level: number): number {
  assertLevel(level);
  if (level === CHARACTER_MAX_LEVEL) return 0;
  const powered = level * level * Math.sqrt(Math.sqrt(level));
  return Math.round((63 * powered + 60) * earlyGameFactor(level));
}

/**
 * Łączne doświadczenie potrzebne do ukończenia poziomów 1…`level`, czyli do osiągnięcia
 * poziomu `level + 1`. Sumujemy zaokrąglone progi, które gra faktycznie stosuje.
 */
export function cumulativeExperience(level: number): number {
  assertLevel(level);
  let total = 0;
  for (let l = CHARACTER_START_LEVEL; l <= level; l++) total += experienceToNextLevel(l);
  return total;
}

export interface ExperienceState {
  level: number;
  /** XP zebrane na bieżącym poziomie (0 na poziomie maksymalnym). */
  experience: number;
}

/**
 * Dodaje doświadczenie i rozlicza awanse. Na poziomie 80 bieżące XP zostaje 0,
 * a nadmiar wraca w `overflow`, żeby serwer złożył go w Esencję (1 punkt / 1 mln).
 */
export function grantExperience(
  state: ExperienceState,
  amount: number,
): ExperienceState & { levelsGained: number; overflow: number } {
  assertLevel(state.level);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`Niepoprawna ilość doświadczenia: ${amount}`);
  }
  let { level } = state;
  let experience = state.experience + amount;
  while (level < CHARACTER_MAX_LEVEL && experience >= experienceToNextLevel(level)) {
    experience -= experienceToNextLevel(level);
    level++;
  }
  let overflow = 0;
  if (level === CHARACTER_MAX_LEVEL) {
    overflow = experience;
    experience = 0;
  }
  return { level, experience, levelsGained: level - state.level, overflow };
}

/** 1 punkt Esencji za każdy pełny milion XP zebrany na poziomie 80 (GDD 7.3). */
export const ESSENCE_XP_PER_POINT = 1_000_000;

export function bankEssence(
  storedXp: number,
  overflow: number,
): { essence: number; essenceXp: number } {
  const total = Math.max(0, storedXp) + Math.max(0, overflow);
  return {
    essence: Math.floor(total / ESSENCE_XP_PER_POINT),
    essenceXp: total % ESSENCE_XP_PER_POINT,
  };
}
