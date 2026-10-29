import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** Katalog zrzutów na maszynie agenta. W CI go nie ma — wtedy zapis idzie obok testu. */
export const STORE_MEDIA = '/cursor/stores/bc-01a18887-7149-751a-8774-112d30a173f0/media';

/**
 * Playwright nie tworzy brakujących katalogów. Ścieżka sklepu jest używana tylko
 * wtedy, gdy katalog już istnieje; inaczej zrzut ląduje w `fallbackDir`.
 */
export function screenshotPath(
  filename: string,
  options: { storeDir?: string; fallbackDir: string } = {
    storeDir: STORE_MEDIA,
    fallbackDir: path.join('test-results', 'zrzuty'),
  },
): string {
  const storeDir = options.storeDir ?? STORE_MEDIA;
  const dir = existsSync(storeDir) ? storeDir : options.fallbackDir;
  mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}
