import { describe, expect, it } from 'vitest';

import { simulateCombat } from '../src/combat.js';
import {
  listingFee,
  matchOrder,
  sellerFee,
  tradableGood,
  type RestingOrder,
} from '../src/market.js';

describe('Etap 5 — giełda i Nodens', () => {
  it('bierze tańszą ofertę, a tysiąc kupujących nie dubluje sztuk', () => {
    const book: RestingOrder[] = [
      { id: 'drogo', characterId: 's1', side: 'sell', price: 12, remaining: 5, createdAt: 1 },
      { id: 'tanio', characterId: 's2', side: 'sell', price: 9, remaining: 2, createdAt: 2 },
    ];
    const first = matchOrder(book, {
      id: 'b',
      characterId: 'buyer',
      side: 'buy',
      type: 'limit',
      price: 12,
      quantity: 3,
      createdAt: 3,
    });
    expect(first.fills.map((fill) => fill.sellOrderId)).toEqual(['tanio', 'drogo']);
    expect(first.fills[0]).toMatchObject({ price: 9, quantity: 2 });
    expect(first.unfilled).toBe(0);

    let resting: RestingOrder[] = [
      {
        id: 'hurt',
        characterId: 'seller',
        side: 'sell',
        price: 100,
        remaining: 1000,
        createdAt: 1,
      },
    ];
    let filled = 0;
    for (let i = 0; i < 1000; i++) {
      const step = matchOrder(resting, {
        id: `k${i}`,
        characterId: `buyer-${i}`,
        side: 'buy',
        type: 'market',
        price: null,
        quantity: 1,
        createdAt: 10 + i,
      });
      filled += step.fills.reduce((sum, fill) => sum + fill.quantity, 0);
      resting = step.resting;
    }
    expect(filled).toBe(1000);
    expect(resting.find((order) => order.id === 'hurt')).toBeUndefined();
  });

  it('liczy prowizję 3% i opłatę wystawienia 1%', () => {
    expect(sellerFee(100)).toBe(3);
    expect(listingFee(100_000)).toBe(1_000);
    expect(tradableGood('material:shell-light')).toBe(true);
    expect(tradableGood('sigil:5')).toBe(false);
    expect(tradableGood('key:dream')).toBe(false);
  });

  it('Sąd Pradawnego przy Skażeniu 0 podnosi obrażenia, a powyżej 50 je ścina', () => {
    const enemy = {
      stats: { strength: 8, defense: 8, accuracy: 8, evasion: 8 },
      life: 5_000,
      damage: 1,
      dread: 0,
      gaze: false,
    };
    const base = {
      level: 20,
      stats: { strength: 80, defense: 80, accuracy: 200, evasion: 200 },
      life: 500,
      maxLife: 500,
      sanity: 100,
      maxSanity: 100,
      classId: 'butcher' as const,
      weaponDamage: 20,
      knowledge: 0,
    };
    const clean = simulateCombat({ ...base, contamination: 0 }, enemy, 'sad', 'judgment');
    const fouled = simulateCombat({ ...base, contamination: 60 }, enemy, 'sad', 'judgment');
    const hit = (log: typeof clean) =>
      log.events.find((event) => event.actor === 'player' && event.damage > 0);
    expect(hit(clean)?.damage).toBeGreaterThan(hit(fouled)?.damage ?? 0);
  });
});
