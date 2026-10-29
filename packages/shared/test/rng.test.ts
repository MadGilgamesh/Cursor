import { describe, expect, it } from 'vitest';

import { createRng, hashSeed } from '../src/rng.js';

describe('createRng', () => {
  it('daje identyczną sekwencję dla tego samego ziarna', () => {
    const a = createRng('ziarno');
    const b = createRng('ziarno');
    const seqA = Array.from({ length: 50 }, () => a.nextUint32());
    const seqB = Array.from({ length: 50 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
  });

  it('daje różne sekwencje dla różnych ziaren', () => {
    expect(createRng('a').nextUint32()).not.toBe(createRng('b').nextUint32());
  });

  it('wznawia sekwencję z zapisanego stanu', () => {
    const rng = createRng('wznowienie');
    rng.nextUint32();
    const resumed = createRng(rng.getState());
    expect(resumed.nextUint32()).toBe(rng.nextUint32());
  });

  it('nextInt mieści się w zakresie i pokrywa wszystkie wartości', () => {
    const rng = createRng('zakres');
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const value = rng.nextInt(-3, 3);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(3);
      seen.add(value);
    }
    expect(seen.size).toBe(7);
  });

  it('nextInt odrzuca niepoprawne zakresy', () => {
    const rng = createRng('błąd');
    expect(() => rng.nextInt(5, 1)).toThrow(RangeError);
    expect(() => rng.nextInt(0.5, 1)).toThrow(RangeError);
    expect(() => rng.nextInt(0, 2 ** 32)).toThrow(RangeError);
  });

  it('rollBp obsługuje wartości brzegowe', () => {
    const rng = createRng('szansa');
    expect(rng.rollBp(0)).toBe(false);
    expect(rng.rollBp(10_000)).toBe(true);
    expect(() => rng.rollBp(12.5)).toThrow(RangeError);
  });

  it('rollBp zbliża się do zadanej szansy', () => {
    const rng = createRng('statystyka');
    let hits = 0;
    const trials = 20_000;
    for (let i = 0; i < trials; i++) if (rng.rollBp(2_500)) hits++;
    expect(hits / trials).toBeGreaterThan(0.23);
    expect(hits / trials).toBeLessThan(0.27);
  });

  it('pickWeighted pomija zerowe wagi i waliduje wejście', () => {
    const rng = createRng('wagi');
    const entries = [
      { item: 'nigdy', weight: 0 },
      { item: 'zawsze', weight: 3 },
    ];
    for (let i = 0; i < 100; i++) expect(rng.pickWeighted(entries)).toBe('zawsze');
    expect(() => rng.pickWeighted([{ item: 'x', weight: 0 }])).toThrow(RangeError);
    expect(() => rng.pickWeighted([{ item: 'x', weight: -1 }])).toThrow(RangeError);
  });
});

describe('hashSeed', () => {
  it('zwraca cztery liczby 32-bitowe bez znaku', () => {
    for (const value of hashSeed('Ulthaeg śni pod falą')) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});
