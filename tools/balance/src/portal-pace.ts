/**
 * Tempo Domeny 1 według opublikowanej krzywej statystyk efektywnych (GDD 10.3)
 * i progu wejścia p ≥ 0,6 z 10.13. To nie jest pełny model treningu — tylko
 * interpolacja tabeli, żeby widzieć, czy cel „dzień 11” w ogóle z niej wynika.
 */
import { portalEnemyStat, portalEquivalentFloor } from '@game/shared';

/** Efektywna statystyka aktywnego F2P (GDD 10.3). */
const STAT_POINTS: readonly (readonly [number, number])[] = [
  [1, 300],
  [7, 2_440],
  [30, 13_900],
  [90, 56_200],
  [180, 146_000],
  [365, 384_000],
  [450, 486_000],
];

/** Logarytmiczna interpolacja między wierszami tabeli. */
export function effectiveStatOnDay(day: number): number {
  const first = STAT_POINTS[0];
  if (!first || day <= first[0]) return first?.[1] ?? 0;
  for (let i = 1; i < STAT_POINTS.length; i++) {
    const prev = STAT_POINTS[i - 1];
    const next = STAT_POINTS[i];
    if (!prev || !next || day > next[0]) continue;
    const t = (day - prev[0]) / (next[0] - prev[0]);
    return Math.round(Math.exp(Math.log(prev[1]) + t * (Math.log(next[1]) - Math.log(prev[1]))));
  }
  return STAT_POINTS[STAT_POINTS.length - 1]?.[1] ?? 0;
}

/** Szansa z 10.13: gracz wchodzi, gdy p ≥ 0,6, czyli statystyka ≥ ~1,0405× wroga. */
const ENTRY_RATIO = 1.0405;

function canEnter(stat: number, fightIndex: number): boolean {
  return stat >= portalEnemyStat(portalEquivalentFloor(fightIndex)) * ENTRY_RATIO;
}

/**
 * Dzień ukończenia Domeny. Gracz idzie naprzód tylko, gdy p ≥ 0,6, i wydaje
 * najwyżej 7 kluczy dziennie (6 z regeneracji + 1 z dziennego zadania).
 * Odłamki ze zleceń i Łowów pomijamy — przy Domenie 1 i tak nie brakuje kluczy.
 */
export function domainFinishDay(domain: number, keysPerDay = 7): number {
  const last = 80 * domain;
  let cleared = 80 * (domain - 1);
  for (let day = 1; day <= 600; day++) {
    const stat = effectiveStatOnDay(day);
    let spent = 0;
    while (spent < keysPerDay && cleared < last && canEnter(stat, cleared + 1)) {
      cleared += 1;
      spent += 1;
    }
    if (cleared >= last) return day;
  }
  return 600;
}
