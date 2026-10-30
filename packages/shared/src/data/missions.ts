/**
 * Dane statyczne: Zlecenia (GDD 5.9, 8.3). Wersjonowane w repo, walidowane przy
 * starcie serwera i w testach. Encje graczy odwołują się do `id`.
 *
 * Etap 1: trzy rodzaje (Zakon, zbierackie, miejskie) × pięć czasów. Zlecenia
 * kultowe (6.4) i Pogłębienie dochodzą w późniejszych etapach. „Zlecenia próbne”
 * z Etapu 0 (`trial.*`) zostały wycofane — migracja `0002` rozlicza otwarte.
 */
import type { CombatStat, MissionTierId } from '../balance.js';

export const MISSION_KINDS = ['order', 'gather', 'city'] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];

/**
 * Statystyka decydująca o szansie (założenie Etapu 1): Zakon walczy (Siła),
 * zbieracze przemykają (Unik), sprawy miejskie wymagają dokładności (Celność).
 */
export const MISSION_KIND_STAT: Record<MissionKind, CombatStat> = {
  order: 'strength',
  gather: 'evasion',
  city: 'accuracy',
};

export interface MissionDef {
  id: string;
  kind: MissionKind;
  name: string;
  description: string;
  tierId: MissionTierId;
  successTexts: readonly string[];
  failureTexts: readonly string[];
}

export const MISSIONS: readonly MissionDef[] = [
  {
    id: 'order.quay-patrol',
    kind: 'order',
    name: 'Patrol nabrzeża',
    description: 'Zakon potrzebuje oczu na nabrzeżu. Policz łodzie, które wracają bez załogi.',
    tierId: 'm5',
    successTexts: [
      'Trzy łodzie, trzy puste pokłady. Raport ląduje na biurku przeora.',
      'Na nabrzeżu cicho. Za cicho, ale to już nie twoja zmiana.',
    ],
    failureTexts: [
      'Coś wyskoczyło spod pomostu, zanim zdążyłeś krzyknąć. Wracasz o własnych siłach. Prawie.',
      'Mgła zgęstniała w ścianę. Gdy się rozwiała, krwawiłeś i nie pamiętałeś dlaczego.',
    ],
  },
  {
    id: 'order.pier-tracks',
    kind: 'order',
    name: 'Ślady na molo',
    description: 'Ktoś zostawił na molo mokre ślady stóp. Prowadzą z morza, nie do morza.',
    tierId: 'm15',
    successTexts: [
      'Ślady kończą się przy studni. Zakon zamknie ją jeszcze tej nocy.',
      'Znalazłeś to, co zostawiło ślady. Teraz nie zostawi już żadnych.',
    ],
    failureTexts: [
      'Ślady prowadziły w kółko. Ty też szedłeś w kółko — aż coś zaszło cię od tyłu.',
      'Na końcu mola czekał ktoś z twoją twarzą. Uciekłeś, ale nie dość szybko.',
    ],
  },
  {
    id: 'order.canal-hunt',
    kind: 'order',
    name: 'Tropienie w kanałach',
    description: 'Pod Solą płynie druga rzeka. Zakon chce wiedzieć, co nią pływa.',
    tierId: 'h1',
    successTexts: [
      'Gniazdo pijawek wypalone. Smród zostanie z tobą na kilka dni.',
      'Wracasz z mapą korytarzy, których nie ma na żadnych planach miasta.',
    ],
    failureTexts: [
      'Woda podniosła się w ciemności. Coś trzymało cię za kostkę, póki nie przestałeś walczyć.',
      'Kanał zakręcał w miejscu, w którym nie powinien. Wyszedłeś pokaleczony trzy ulice dalej.',
    ],
  },
  {
    id: 'order.lighthouse-ambush',
    kind: 'order',
    name: 'Zasadzka w latarni',
    description: 'Kultyści Chóru chcą zgasić Latarnię Północną. Zakon czeka na nich w środku.',
    tierId: 'h4',
    successTexts: [
      'Latarnia świeci. Kultyści już nie śpiewają.',
      'Zasadzka się udała. Przeor kiwa głową — to więcej niż pochwała.',
    ],
    failureTexts: [
      'Śpiew Chóru wszedł ci pod czaszkę. Ocknąłeś się na schodach, z krwią w uszach.',
      'Było ich więcej, niż mówił informator. Informator też był wśród nich.',
    ],
  },
  {
    id: 'order.drowned-raid',
    kind: 'order',
    name: 'Nocna obława na Topielców',
    description: 'Przy odpływie Topielcy wychodzą na plażę. Zakon wychodzi im naprzeciw.',
    tierId: 'h8',
    successTexts: [
      'Plaża czysta do świtu. Morze zabrało ciała z powrotem — i nic więcej.',
      'Obława skończona. Liczysz Topielców; jeden miał twoje imię wyszyte na kołnierzu.',
    ],
    failureTexts: [
      'Odpływ odsłonił więcej, niż mieliście sił. Zakon wycofał się, ty — ostatni.',
      'Topielec złapał cię za rękę i zaczął ciągnąć. Puścił dopiero przy linii wody.',
    ],
  },
  {
    id: 'gather.wreck-search',
    kind: 'gather',
    name: 'Przeszukanie wraku przy falochronie',
    description:
      'Urząd chce wiedzieć, co przyniósł nocny przypływ. Formularz w trzech egzemplarzach.',
    tierId: 'm5',
    successTexts: [
      'W ładowni tylko mokre skrzynie i zapach czegoś, co nie jest rybą.',
      'Ktoś wyrył od środka kadłuba ten sam znak. Wiele razy. Zapisujesz go w formularzu.',
    ],
    failureTexts: [
      'Pokład zarwał się pod tobą. Ładownia była pełna wody — i nie tylko wody.',
      'Wrak przechylił się z przypływem. Wydostałeś się z rozciętym bokiem.',
    ],
  },
  {
    id: 'gather.kelp-harvest',
    kind: 'gather',
    name: 'Zbiór morskiej rzęsy',
    description: 'Apteka św. Agaty płaci za rzęsę z płycizn. Zbieraj, zanim zrobi się ciemno.',
    tierId: 'm15',
    successTexts: [
      'Kosz pełny. Rzęsa jest cieplejsza, niż powinna.',
      'Coś pod wodą odprowadza cię wzrokiem aż do brzegu, ale kosz jest pełny.',
    ],
    failureTexts: [
      'Rzęsa owinęła ci się wokół nóg i zaczęła zaciskać. Kosz zostawiłeś w wodzie.',
      'Pośliznąłeś się na kamieniach. Kosz pływa gdzieś daleko, ty krwawisz na brzegu.',
    ],
  },
  {
    id: 'gather.amber-ebb',
    kind: 'gather',
    name: 'Bursztyn z odpływu',
    description:
      'Odpływ odsłonił czarny piasek. Bursztyn to bursztyn, nawet jeśli coś w nim pływa.',
    tierId: 'h1',
    successTexts: [
      'W jednej bryłce zastygło oko. Mruga, gdy nikt nie patrzy.',
      'Wracasz z pełną sakwą i piaskiem w każdej kieszeni.',
    ],
    failureTexts: [
      'Przypływ wrócił szybciej, niż mówiły tablice. Fala rzuciła tobą o skały.',
      'Piasek zapadł się pod stopami. Wygrzebałeś się, ale bursztyn został na dole.',
    ],
  },
  {
    id: 'gather.cliff-herbs',
    kind: 'gather',
    name: 'Ziele z cmentarza na klifie',
    description:
      'Najlepszy piołun rośnie na grobach. Grabarz nie pyta, czemu przychodzisz po zmroku.',
    tierId: 'h4',
    successTexts: [
      'Sakwa pełna piołunu. Jeden grób był otwarty — od środka.',
      'Ziele zebrane. Grabarz macha ci na pożegnanie łopatą.',
    ],
    failureTexts: [
      'Ziemia na jednym grobie się poruszyła. Spadłeś z klifu, uciekając — na szczęście nisko.',
      'Coś kopało obok ciebie przez całą noc. Rano miałeś pokaleczone ręce i pusty worek.',
    ],
  },
  {
    id: 'gather.schooner-hold',
    kind: 'gather',
    name: 'Ładownia zatopionego szkunera',
    description:
      'Szkuner „Miłosierdzie” zatonął z ładunkiem srebra. Przy najniższym odpływie da się zejść.',
    tierId: 'h8',
    successTexts: [
      'Srebro było. Załoga też — wciąż przy swoich stanowiskach.',
      'Wynosisz skrzynię. W ładowni ktoś zapukał trzy razy, gdy wychodziłeś.',
    ],
    failureTexts: [
      'Woda wróciła, zanim skończyłeś. Wypłynąłeś przez rozbity iluminator, zostawiając skórę na szkle.',
      'Załoga szkunera nie chciała oddać ładunku. Kapitan wciąż ma szablę.',
    ],
  },
  {
    id: 'city.summons-delivery',
    kind: 'city',
    name: 'Doręczenie wezwań Urzędu',
    description: 'Urząd ds. Przebudzonych wzywa na przesłuchania. Ktoś musi roznieść wezwania.',
    tierId: 'm5',
    successTexts: [
      'Wszystkie wezwania doręczone. Jeden adresat wyglądał, jakby na nie czekał.',
      'Pod jednym adresem nikt nie otworzył, ale ktoś oddychał przy drzwiach. Wsuwasz pod nie kopertę.',
    ],
    failureTexts: [
      'Adresat nie chciał przyjąć wezwania. Chciał za to przyjąć twoją krew.',
      'Pomyliłeś drzwi. Za nimi był ktoś, kto nie lubi gości.',
    ],
  },
  {
    id: 'city.fish-weighing',
    kind: 'city',
    name: 'Ważenie ryb na targu',
    description: 'Rada Miasta nie ufa wagom kupców. Ufa — jeszcze — tobie.',
    tierId: 'm15',
    successTexts: [
      'Wagi sprawdzone. Jedna ryba ważyła tyle co dziecko — i tak też wyglądała.',
      'Dwóch kupców oszukiwało. Rada będzie zadowolona; kupcy — mniej.',
    ],
    failureTexts: [
      'Kupiec, którego przyłapałeś, miał braci. I haki do ryb.',
      'Ryba w beczce ugryzła cię w rękę. Do kości.',
    ],
  },
  {
    id: 'city.morgue-census',
    kind: 'city',
    name: 'Spis zmarłych w kostnicy',
    description:
      'Kostnica, w której się obudziłeś, potrzebuje kogoś do spisu. Ironia nikogo tu nie bawi.',
    tierId: 'h1',
    successTexts: [
      'Spis zgadza się co do jednego ciała. Ciało też się zgadza — wróciło na swój stół.',
      'Wpisujesz imiona do księgi. Jedno było już wpisane twoim charakterem pisma.',
    ],
    failureTexts: [
      'Jeden z „zmarłych” nie zgadzał się ze spisem. Ani z tym, że jest martwy.',
      'Lampa zgasła. Gdy ją zapaliłeś, stoły stały bliżej ciebie niż przedtem.',
    ],
  },
  {
    id: 'city.pharmacy-watch',
    kind: 'city',
    name: 'Nocna warta w aptece św. Agaty',
    description:
      'Ktoś kradnie laudanum z apteki. Siostry chcą wiedzieć kto — i najlepiej po cichu.',
    tierId: 'h4',
    successTexts: [
      'Złodziejem był aptekarz. Siostry podziękowały i kazały zapomnieć.',
      'Nikt nie przyszedł. Rano okazało się, że laudanum i tak ubyło.',
    ],
    failureTexts: [
      'Złodziej był szybszy. I miał skalpel.',
      'Zasnąłeś na posterunku. Obudziłeś się z raną po igle i lukami w pamięci.',
    ],
  },
  {
    id: 'city.third-vault',
    kind: 'city',
    name: 'Inwentaryzacja Trzeciego Skarbca',
    description:
      'Trzeci Skarbiec Rady nie był otwierany od dwudziestu lat. Ktoś musi sprawdzić, co w nim jest.',
    tierId: 'h8',
    successTexts: [
      'Skarbiec spisany. Brakuje jednej szkatuły; w jej miejscu leży muszla.',
      'Inwentarz zgadza się co do grosza. To najbardziej niepokojące ze wszystkiego.',
    ],
    failureTexts: [
      'Drzwi Skarbca zamknęły się za tobą same. Otworzyły się rano — razem z twoimi ranami.',
      'W Skarbcu coś liczyło razem z tobą. Szybciej. I głośniej.',
    ],
  },
];

const MISSIONS_BY_ID = new Map(MISSIONS.map((mission) => [mission.id, mission]));

export function findMission(id: string): MissionDef | undefined {
  return MISSIONS_BY_ID.get(id);
}
