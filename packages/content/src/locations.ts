/**
 * Lokacje, które gra na main naprawdę ma: notatki z Soli, cztery miasta,
 * Domeny Portalu i wyprawy. Rekord treści, nie miejsce zaszyte tylko w ekranie.
 */
import { CITY_NAMES, EXPEDITIONS, PORTAL_DOMAINS } from '@game/shared';

import type { LocationRecord } from './schema.js';

const SOL_NOTES: readonly LocationRecord[] = [
  {
    id: 'location.sol.morgue',
    name: 'Kostnica',
    district: 'Sól',
    description: 'Budzisz się na stole kostnicy. Morze wciąż szepcze.',
  },
  {
    id: 'location.sol.fencing',
    name: 'Fechtownia',
    district: 'Sól',
    description: 'Piwnica i Sala Kapitańska. Trening ciała, które jeszcze pamięta, jak stać.',
  },
  {
    id: 'location.sol.quay',
    name: 'Nabrzeże',
    district: 'Sól',
    description: 'Zakon potrzebuje oczu na nabrzeżu. Policz łodzie, które wracają bez załogi.',
  },
  {
    id: 'location.sol.pier',
    name: 'Molo',
    district: 'Sól',
    description: 'Mokre ślady stóp prowadzą z morza, nie do morza.',
  },
  {
    id: 'location.sol.canals',
    name: 'Kanały',
    district: 'Sól',
    description: 'Pod Solą płynie druga rzeka. Zakon chce wiedzieć, co nią pływa.',
  },
  {
    id: 'location.sol.lighthouse',
    name: 'Latarnia Północna',
    district: 'Sól',
    description: 'Kultyści Chóru chcą ją zgasić. Zakon czeka w środku.',
  },
  {
    id: 'location.sol.beach',
    name: 'Plaża',
    district: 'Sól',
    description: 'Przy odpływie Topielcy wychodzą na plażę. Zakon wychodzi im naprzeciw.',
  },
  {
    id: 'location.sol.breakwater',
    name: 'Falochron',
    district: 'Sól',
    description: 'Wrak przy falochronie. Urząd chce wiedzieć, co przyniósł nocny przypływ.',
  },
];

function worldLocations(): LocationRecord[] {
  const cities = (Object.entries(CITY_NAMES) as [keyof typeof CITY_NAMES, string][]).map(
    ([id, name]) => ({
      id: `location.city.${id}`,
      name,
      district: name,
      description: `Jedno z czterech miast Brzegu.`,
    }),
  );
  const domains = PORTAL_DOMAINS.map((domain) => ({
    id: `location.portal.${domain.domain}`,
    name: domain.place,
    district: domain.god,
    description: `${domain.modifierName}. Materiał: ${domain.materialName}.`,
  }));
  const expeditions = EXPEDITIONS.map((expedition) => ({
    id: `location.expedition.${expedition.id}`,
    name: expedition.name,
    district: 'Wyprawa',
    description: `Poziom ${expedition.level}, drużyna ${expedition.party}, ${expedition.hours} h.`,
  }));
  return [...SOL_NOTES, ...cities, ...domains, ...expeditions];
}

export const LOCATIONS: readonly LocationRecord[] = worldLocations();
