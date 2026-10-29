/**
 * Deterministyczny generator liczb pseudolosowych (sfc32) z ziarnem tekstowym.
 *
 * Serwer jest jedynym źródłem prawdy dla losowań: to on wybiera ziarno
 * (np. z `crypto.randomBytes`) i wykonuje rzut. Ten sam algorytm w kliencie
 * służy wyłącznie do odtwarzania (replay) i podglądu wyników, które serwer już
 * rozstrzygnął. Dlatego algorytm musi dawać identyczne wyniki w każdym
 * środowisku JS — używamy wyłącznie arytmetyki 32-bitowej (`Math.imul`, `>>>`),
 * bez liczb zmiennoprzecinkowych.
 */

export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Kolejna liczba całkowita z zakresu [0, 2^32). */
  nextUint32(): number;
  /** Liczba całkowita z zakresu [min, max] (obustronnie domknięty), bez obciążenia modulo. */
  nextInt(min: number, max: number): number;
  /** Rzut z szansą wyrażoną w punktach bazowych (10 000 = 100%). */
  rollBp(chanceBp: number): boolean;
  /** Losowanie ważone; wagi muszą być nieujemnymi liczbami całkowitymi o dodatniej sumie. */
  pickWeighted<T>(entries: readonly WeightedEntry<T>[]): T;
  /** Migawka stanu — pozwala wznowić sekwencję (np. zapisać ją w bazie). */
  getState(): RngState;
}

export interface WeightedEntry<T> {
  readonly item: T;
  readonly weight: number;
}

const UINT32_RANGE = 0x1_0000_0000;
const WARMUP_ROUNDS = 15;

/** Hash cyrb128: zamienia dowolny tekst na 128 bitów stanu początkowego. */
export function hashSeed(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * Tworzy generator z ziarna tekstowego albo wznawia go z zapisanego stanu.
 * Ziarno tekstowe przechodzi rozgrzewkę, stan wznowiony — nie.
 */
export function createRng(seed: string | RngState): Rng {
  let [a, b, c, d] = typeof seed === 'string' ? hashSeed(seed) : seed;

  const nextUint32 = (): number => {
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };

  if (typeof seed === 'string') {
    for (let i = 0; i < WARMUP_ROUNDS; i++) nextUint32();
  }

  const nextInt = (min: number, max: number): number => {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
      throw new RangeError(`Niepoprawny zakres losowania: [${min}, ${max}]`);
    }
    const range = max - min + 1;
    if (range > UINT32_RANGE) {
      throw new RangeError('Zakres losowania nie może przekraczać 2^32 wartości');
    }
    // Odrzucamy wartości z „ogona”, który powodowałby obciążenie modulo.
    const limit = UINT32_RANGE - (UINT32_RANGE % range);
    let x = nextUint32();
    while (x >= limit) x = nextUint32();
    return min + (x % range);
  };

  return {
    nextUint32,
    nextInt,
    rollBp(chanceBp) {
      if (!Number.isSafeInteger(chanceBp)) {
        throw new RangeError('Szansa musi być liczbą całkowitą w punktach bazowych');
      }
      if (chanceBp <= 0) return false;
      if (chanceBp >= 10_000) return true;
      return nextInt(0, 9_999) < chanceBp;
    },
    pickWeighted(entries) {
      let total = 0;
      for (const entry of entries) {
        if (!Number.isSafeInteger(entry.weight) || entry.weight < 0) {
          throw new RangeError('Wagi muszą być nieujemnymi liczbami całkowitymi');
        }
        total += entry.weight;
      }
      if (total <= 0) throw new RangeError('Suma wag musi być dodatnia');
      let roll = nextInt(0, total - 1);
      for (const entry of entries) {
        if (roll < entry.weight) return entry.item;
        roll -= entry.weight;
      }
      throw new Error('Nieosiągalne: losowanie ważone nie wybrało elementu');
    },
    getState: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
}
