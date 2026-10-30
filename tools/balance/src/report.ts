/** Raport symulacji: `pnpm --filter @game/balance simulate`. Kod wyjścia 1 przy alarmie. */
import { BALANCE_VERSION } from '@game/shared';

import { DOMAIN_DAY_TARGETS, LEVEL_80_DAY_TARGET, simulateActiveCareer } from './career.js';
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
const career = simulateActiveCareer();
const careerAlarms: string[] = [];
console.log('\n| Kamień | Dzień symulacji | Cel GDD | Odchylenie | Stan |');
console.log('|---|---|---|---|---|');
career.domainDays.forEach((day, index) => {
  const expected = DOMAIN_DAY_TARGETS[index] ?? day;
  const off = deviation(day, expected);
  const alarm = off > ALARM_THRESHOLD;
  if (alarm) careerAlarms.push(`Domena ${String(index + 1)}`);
  console.log(
    `| Domena ${String(index + 1)} | ${String(day)} | ${String(expected)} | ${(off * 100).toFixed(1)}% | ${alarm ? 'ALARM' : 'OK'} |`,
  );
});
const levelOff = deviation(career.level80Day, LEVEL_80_DAY_TARGET);
const levelAlarm = levelOff > ALARM_THRESHOLD;
if (levelAlarm) careerAlarms.push('poziom 80');
console.log(
  `| Poziom 80 | ${String(career.level80Day)} | ${String(LEVEL_80_DAY_TARGET)} | ${(levelOff * 100).toFixed(1)}% | ${levelAlarm ? 'ALARM' : 'OK'} |`,
);
if (rows.some((row) => row.alarm) || careerAlarms.length > 0) process.exit(1);
