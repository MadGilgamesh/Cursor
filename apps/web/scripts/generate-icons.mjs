// Generuje ikony PWA (PNG) z `public/favicon.svg` przy użyciu Chromium z Playwrighta.
// Uruchom ręcznie po zmianie ikony: pnpm --filter @game/web icons
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const svg = await readFile(`${publicDir}favicon.svg`, 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// Ikona „maskable” potrzebuje marginesu bezpieczeństwa (~10%) i pełnego tła.
const targets = [
  { file: 'pwa-192x192.png', size: 192, padding: 0 },
  { file: 'pwa-512x512.png', size: 512, padding: 0 },
  { file: 'apple-touch-icon-180x180.png', size: 180, padding: 0 },
  { file: 'maskable-icon-512x512.png', size: 512, padding: 0.12 },
];

const browser = await chromium.launch();
try {
  for (const { file, size, padding } of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const inner = Math.round(size * (1 - padding * 2));
    await page.setContent(
      `<body style="margin:0;background:#07080b;display:grid;place-items:center;height:100vh">
         <img src="${dataUrl}" width="${inner}" height="${inner}">
       </body>`,
    );
    await page.screenshot({ path: `${publicDir}${file}`, omitBackground: false });
    await page.close();
    console.log(`✓ ${file}`);
  }
} finally {
  await browser.close();
}
