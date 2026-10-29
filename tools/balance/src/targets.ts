/**
 * Wartości referencyjne z GDD 1.1 (rozdz. 10) porównywane z symulacją.
 * Próg alarmu z GDD 10.12: odchylenie > 15%.
 */
export const ALARM_THRESHOLD = 0.15;

/**
 * GDD 10 (wstęp): „Wigor dzienny to regeneracja ograniczona limitem w każdej przerwie
 * plus 40 z nagród”. Źródła nagród (kalendarz, Kawa z Kresu) dochodzą w Etapie 1,
 * więc do tego czasu doliczamy je jako założenie projektu.
 */
export const REWARD_VIGOR_PER_DAY = 40;

/** GDD 10.1 „Wigor dziennie (symulacja)”, profile F2P. Patronat przychodzi w Etapie 9. */
export const VIGOR_PER_DAY_TARGETS = { active: 560, casual: 440 } as const;

export function deviation(actual: number, expected: number): number {
  return Math.abs(actual - expected) / expected;
}
