import type { Activity, Resources } from '@game/shared';
import { describe, expect, it } from 'vitest';

import { isReady, nextStep, resourceViews } from '../src/game/state';
import { base64UrlToBytes } from '../src/push/client';

const T0 = Date.UTC(2026, 9, 29, 12);
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

const resources = (vigor: number): Resources => ({
  life: { value: 100, max: 100, updatedAt: iso(T0) },
  vigor: { value: vigor, max: 100, updatedAt: iso(T0) },
  toil: { value: 50, max: 50, updatedAt: iso(T0) },
  sanity: { value: 100, max: 100, updatedAt: iso(T0) },
});

const activity = (status: Activity['status'], endAt: number): Activity => ({
  id: '01a188a0-a755-76ad-aeec-cbf3830cb2f6',
  type: 'mission',
  defId: 'order.quay-patrol',
  status,
  startAt: iso(endAt - 5 * MIN),
  endAt: iso(endAt),
  result: null,
});

const vigorView = (value: number, now: number) =>
  resourceViews(resources(value), now).find((view) => view.kind === 'vigor')!;

describe('resourceViews', () => {
  it('dolicza regenerację z czasu serwera tą samą formułą co serwer', () => {
    expect(vigorView(80, T0 + 25 * MIN)).toMatchObject({
      value: 90,
      fullAt: T0 + 40 * MIN,
    });
    expect(vigorView(100, T0).fullAt).toBeNull();
  });

  it('Sypialnia skraca czas do pełnego Wigoru, a zero premii zostawia 40 min', () => {
    const pace = { patron: false, vigorRegenBp: 500, sanityRegenBp: 0 };
    const interval = Math.round((10 * MIN * 10_000) / 10_500);
    const boosted = resourceViews(resources(80), T0, pace).find((view) => view.kind === 'vigor')!;
    expect(boosted.fullAt).toBe(T0 + 4 * interval);
    expect(vigorView(80, T0).fullAt).toBe(T0 + 40 * MIN);
    expect(nextStep([], boosted, T0, pace)).toEqual({ kind: 'board', vigor: 80 });
    const resting = resourceViews(resources(2), T0, pace).find((view) => view.kind === 'vigor')!;
    expect(nextStep([], resting, T0, pace)).toEqual({ kind: 'rest', at: T0 + interval });
  });
});

describe('nextStep (brak martwych końców)', () => {
  it('najpierw odbiór gotowych nagród', () => {
    expect(nextStep([activity('active', T0)], vigorView(0, T0), T0)).toEqual({ kind: 'claim' });
    expect(isReady(activity('completed', T0 + 1), T0)).toBe(true);
  });

  it('gdy zlecenie trwa — kiedy wrócić', () => {
    expect(nextStep([activity('active', T0 + 5 * MIN)], vigorView(100, T0), T0)).toEqual({
      kind: 'wait',
      at: T0 + 5 * MIN,
    });
  });

  it('z Wigorem — tablica zleceń, bez Wigoru — kiedy wystarczy', () => {
    expect(nextStep([], vigorView(30, T0), T0)).toEqual({ kind: 'board', vigor: 30 });
    expect(nextStep([], vigorView(2, T0), T0)).toEqual({ kind: 'rest', at: T0 + 10 * MIN });
  });
});

describe('base64UrlToBytes', () => {
  it('dekoduje klucz VAPID z base64url', () => {
    expect([...base64UrlToBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});
