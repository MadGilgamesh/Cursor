import { computeGoldenVectors, GOLDEN_VECTORS } from '@game/shared';
import { describe, expect, it } from 'vitest';

describe('logika współdzielona po stronie klienta', () => {
  it('klient (przez potok Vite) liczy formuły identycznie jak wektory referencyjne', () => {
    expect(computeGoldenVectors()).toEqual(GOLDEN_VECTORS);
  });
});
