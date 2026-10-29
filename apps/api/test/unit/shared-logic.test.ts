import { computeGoldenVectors, GOLDEN_VECTORS } from '@game/shared';
import { describe, expect, it } from 'vitest';

import { processTimerJob } from '../../src/queues/timers.js';

describe('logika współdzielona po stronie serwera', () => {
  it('serwer liczy formuły identycznie jak wektory referencyjne', () => {
    expect(computeGoldenVectors()).toEqual(GOLDEN_VECTORS);
  });
});

describe('processTimerJob', () => {
  it('obsługuje heartbeat', () => {
    const result = processTimerJob({
      data: { type: 'system.heartbeat', requestedAt: new Date().toISOString() },
    });
    expect(result.type).toBe('system.heartbeat');
  });
});
