/**
 * Zegar serwera — jedyne źródło czasu w logice gry (GDD 9.1).
 * Logika nigdy nie woła `new Date()` bezpośrednio, tylko `clock.now()`, dzięki
 * czemu testy mogą używać wirtualnego zegara (np. regeneracja, timery).
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Zegar sterowany ręcznie — do testów. */
export class ManualClock implements Clock {
  #epochMs: number;

  constructor(start: Date | number = Date.now()) {
    this.#epochMs = typeof start === 'number' ? start : start.getTime();
  }

  now(): Date {
    return new Date(this.#epochMs);
  }

  advance(ms: number): void {
    this.#epochMs += ms;
  }
}

/** Czas systemowy przesunięty o regulowany offset — dla testów E2E na działającym serwerze. */
export class OffsetClock implements Clock {
  #offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.#offsetMs);
  }

  advance(ms: number): void {
    if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError('Zegar może iść tylko naprzód');
    this.#offsetMs += ms;
  }
}
