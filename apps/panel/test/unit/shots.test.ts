import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { screenshotPath } from '../shots.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('ścieżka zrzutu', () => {
  it('gdy katalog sklepu nie istnieje, zapisuje obok testu', () => {
    const fallback = mkdtempSync(path.join(tmpdir(), 'zrzuty-'));
    created.push(fallback);
    const target = screenshotPath('panel-lista-tresci.png', {
      storeDir: path.join(fallback, 'nie-ma-takiego-sklepu'),
      fallbackDir: path.join(fallback, 'wynik'),
    });
    expect(target).toBe(path.join(fallback, 'wynik', 'panel-lista-tresci.png'));
  });

  it('gdy katalog sklepu istnieje, zapisuje właśnie tam', () => {
    const store = mkdtempSync(path.join(tmpdir(), 'sklep-'));
    created.push(store);
    const target = screenshotPath('panel-edytor-eventu.png', {
      storeDir: store,
      fallbackDir: path.join(store, 'nie-uzyte'),
    });
    expect(target).toBe(path.join(store, 'panel-edytor-eventu.png'));
  });
});
