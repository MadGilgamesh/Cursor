import { describe, expect, it } from 'vitest';

import { domainFinishDay, effectiveStatOnDay } from '../src/portal-pace.js';

describe('tempo Portalu (interpolacja tabeli 10.3)', () => {
  it('Domena 1 kończy się w dniu 13, nie w dniu 11 z GDD', () => {
    // Cel GDD 10.13: dzień 11 ±15% (9–12). Ten model, oparty tylko na
    // opublikowanej krzywej statystyk, daje dzień 13 (odchylenie ~18%).
    // Nie dociągamy liczby — luka jest opisana w README.
    expect(effectiveStatOnDay(7)).toBe(2440);
    expect(domainFinishDay(1)).toBe(13);
    expect(Math.abs(13 - 11) / 11).toBeGreaterThan(0.15);
  });
});
