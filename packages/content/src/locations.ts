import type { LocationRecord } from './schema.js';

/**
 * Lokacje już obecne w tekstach danych statycznych i pulpitu (Sól).
 * Rekord treści, nie miejsce zaszyte w kodzie ekranu.
 */
export const LOCATIONS: readonly LocationRecord[] = [
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
