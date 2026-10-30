/**
 * Symulacja Monte Carlo gracza-bota (GDD 10.12) na tych samych funkcjach balansu,
 * których używa serwer (`@game/shared`). Wyniki porównujemy z tabelami GDD 10.
 */
import {
  MINUTE_MS,
  createRng,
  materializeResource,
  resourceMax,
  spendResource,
} from '@game/shared';

export interface PlayerProfile {
  id: 'active' | 'casual';
  label: string;
  /** Przerwy między kolejnymi sesjami w ciągu dnia (min); reszta doby to noc. */
  gapsMinutes: readonly number[];
}

/** Profile z GDD 10 (wstęp): aktywny 8 sesji co 2 h, okazjonalny 4 sesje po 5/5/4 h; noc 10 h. */
export const PROFILES: readonly PlayerProfile[] = [
  { id: 'active', label: 'aktywny F2P', gapsMinutes: [120, 120, 120, 120, 120, 120, 120] },
  { id: 'casual', label: 'okazjonalny F2P', gapsMinutes: [300, 300, 240] },
];

export const DAY_MINUTES = 24 * 60;

export interface VigorSimulation {
  profile: PlayerProfile['id'];
  days: number;
  /** Średni Wigor wydany dziennie (wyłącznie z regeneracji). */
  regenPerDay: number;
  /** Najwyższa zaobserwowana wartość Wigoru — nie może przekroczyć limitu. */
  peakVigor: number;
}

/**
 * Bot w każdej sesji wydaje cały dostępny Wigor (wielokrotności 5 — koszt najtańszego
 * zlecenia). Godziny sesji mają losowe odchylenie ±`jitterMinutes` z deterministycznego RNG.
 */
export function simulateVigor(
  profile: PlayerProfile,
  { days = 600, seed = 'balans', jitterMinutes = 15 } = {},
): VigorSimulation {
  const rng = createRng(`${seed}:${profile.id}`);
  const max = resourceMax('vigor', { level: 1, knowledge: 0 });
  const offsets = [0];
  for (const gap of profile.gapsMinutes) offsets.push((offsets.at(-1) ?? 0) + gap);
  if ((offsets.at(-1) ?? 0) >= DAY_MINUTES) throw new RangeError('Sesje nie mieszczą się w dobie');

  let state = { value: max, updatedAt: 0 };
  let spentTotal = 0;
  let peakVigor = 0;
  for (let day = 0; day < days; day++) {
    for (const offset of offsets) {
      const jitter = rng.nextInt(-jitterMinutes, jitterMinutes);
      const at = (day * DAY_MINUTES + offset + jitter) * MINUTE_MS;
      const current = materializeResource('vigor', state, Math.max(at, state.updatedAt), max);
      peakVigor = Math.max(peakVigor, current.value);
      const spend = current.value - (current.value % 5);
      const next = spendResource('vigor', current, current.updatedAt, max, spend);
      if (!next) throw new Error('Symulacja wydała więcej Wigoru, niż miała');
      // Pierwsza doba to rozbieg (bot startuje z pełnym Wigorem) — nie liczymy jej.
      if (day > 0) spentTotal += spend;
      state = next;
    }
  }
  return {
    profile: profile.id,
    days,
    regenPerDay: spentTotal / (days - 1),
    peakVigor,
  };
}
