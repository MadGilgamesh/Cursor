/** Raport symulacji: `pnpm --filter @game/balance simulate`. Kod wyjścia 1 przy alarmie. */
import { BALANCE_VERSION } from '@game/shared';

import { PROFILES, simulateVigor } from './simulate.js';
import {
  ALARM_THRESHOLD,
  REWARD_VIGOR_PER_DAY,
  VIGOR_PER_DAY_TARGETS,
  deviation,
} from './targets.js';

const rows = PROFILES.map((profile) => {
  const result = simulateVigor(profile);
  const perDay = result.regenPerDay + REWARD_VIGOR_PER_DAY;
  const expected = VIGOR_PER_DAY_TARGETS[profile.id];
  const off = deviation(perDay, expected);
  return { label: profile.label, perDay, expected, off, alarm: off > ALARM_THRESHOLD };
});

console.log(`Balans v${String(BALANCE_VERSION)} — symulacja 600 dni (GDD 10.12)\n`);
console.log('| Profil | Wigor/dzień (symulacja) | GDD 10.1 | Odchylenie | Stan |');
console.log('|---|---|---|---|---|');
for (const row of rows) {
  console.log(
    `| ${row.label} | ${row.perDay.toFixed(1)} | ${String(row.expected)} | ${(row.off * 100).toFixed(1)}% | ${row.alarm ? 'ALARM' : 'OK'} |`,
  );
}
console.log(
  '\nTabele postępu (poziom, Studnia, Portal) dojdą wraz z systemami Etapów 1–2; Patronat — w Etapie 9.',
);
if (rows.some((row) => row.alarm)) process.exit(1);
