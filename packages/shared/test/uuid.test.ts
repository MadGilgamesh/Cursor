import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomUuid } from '../src/uuid.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid', () => {
  afterEach(() => {
    Reflect.deleteProperty(crypto, 'randomUUID');
    vi.restoreAllMocks();
  });

  it('woła crypto.randomUUID, gdy jest funkcją', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(function (this: unknown) {
      expect(this).toBe(crypto);
      return 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    });
    expect(randomUuid()).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('składa UUID v4 z getRandomValues, gdy randomUUID nie jest funkcją', () => {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
    const values = vi.spyOn(crypto, 'getRandomValues');
    const ids = new Set<string>();
    for (let i = 0; i < 32; i += 1) {
      const id = randomUuid();
      expect(id).toMatch(UUID_V4);
      ids.add(id);
    }
    expect(ids.size).toBe(32);
    expect(values).toHaveBeenCalled();
    expect(typeof crypto.randomUUID).not.toBe('function');
  });
});
