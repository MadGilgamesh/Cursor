import { describe, expect, it } from 'vitest';

import {
  bokrugStarOneDay,
  domainFinishDay,
  dreamCareerDay,
  effectiveStatOnDay,
} from '../src/portal-pace.js';

describe('tempo Portalu (interpolacja tabeli 10.3)', () => {
  it('Domena 1 kończy się w dniu 13, nie w dniu 11 z GDD', () => {
    // Cel GDD 10.13: dzień 11 ±15% (9–12). Ten model, oparty tylko na
    // opublikowanej krzywej statystyk, daje dzień 13 (odchylenie ~18%).
    // Nie dociągamy liczby — luka jest opisana w README.
    expect(effectiveStatOnDay(7)).toBe(2440);
    expect(domainFinishDay(1)).toBe(13);
    expect(Math.abs(13 - 11) / 11).toBeGreaterThan(0.15);
  });

  it('Domena 3 mieści się w 62 ±15%, a ★1 Bokruga wychodzi po dniu 18', () => {
    // Aktywny F2P, krzywa 10.3, próg p ≥ 0,6. Domena 3 jest limitowana
    // statystyką (7 i 8,9 klucza dziennie dają ten sam dzień).
    expect(dreamCareerDay(1)).toBe(13);
    expect(dreamCareerDay(3)).toBe(70);
    expect(Math.abs(70 - 62) / 62).toBeLessThanOrEqual(0.15);
    // „Osiągalne ok. dnia 18” przy 8,9 klucza z tabeli 10.13 wychodzi w dniu 22
    // (ukończenie ★1, nie samo odblokowanie). Odblokowanie jest w dniu 13,
    // razem z awatarem Snu. Nie dociągamy krzywej.
    expect(bokrugStarOneDay(8.9)).toBe(22);
    expect(Math.abs(22 - 18) / 18).toBeGreaterThan(0.15);
  });

  it('Sen w Portalu nie kończy Domeny 11 w dniu 472', () => {
    // Cel GDD 11: dzień 472 ±15% dla aktywnego F2P. Krzywa statystyk z tabeli 10.3
    // staje w dniu 450 na 486 000 i nie dogania wroga Azathotha. Model zwraca sufit 800.
    // Nie dociągamy krzywej.
    expect(dreamCareerDay(9)).toBe(338);
    expect(dreamCareerDay(10)).toBe(393);
    expect(dreamCareerDay(11)).toBe(800);
    expect(Math.abs(800 - 472) / 472).toBeGreaterThan(0.15);
  });
});
