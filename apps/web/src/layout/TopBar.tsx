import type { SessionResponse } from '@game/shared';

/**
 * Pasek zasobów wg GDD 3.3. Wartości pojawią się wraz z `ResourceState`
 * (leniwa regeneracja liczona na serwerze) — na razie są puste.
 */
const RESOURCES = [
  { name: 'Życie', bar: 'bg-life-500' },
  { name: 'Wigor', bar: 'bg-vigor-400' },
  { name: 'Znój', bar: 'bg-toil-400' },
  { name: 'Poczytalność', bar: 'bg-sanity-400' },
] as const;

/** Górny pasek gracza: portret, imię, poziom, Srebro i zasoby. */
export function TopBar({ session }: { session: SessionResponse }) {
  const { character } = session;
  return (
    <header className="pt-safe sticky top-0 z-10 border-b border-brass-700/40 bg-abyss-950/90 px-4 pb-2 backdrop-blur">
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-[50%] border-2 border-brass-500 bg-abyss-800 font-display text-xl text-brass-300"
          >
            {character.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p
              data-testid="character-name"
              className="truncate font-display text-lg font-semibold text-bone-50"
            >
              {character.name}
            </p>
            <p className="text-xs text-bone-400">Poziom {character.level}</p>
          </div>
          <p
            title="Srebro — wkrótce"
            className="flex items-center gap-1.5 rounded-full border border-abyss-600 bg-abyss-900 py-1 pr-2.5 pl-1.5 text-xs text-bone-400"
          >
            <span aria-hidden="true" className="size-3 rounded-full bg-bone-200 shadow-glow" />
            <span className="sr-only">Srebro: </span>—
          </p>
        </div>
        <ul aria-label="Zasoby" className="mt-2 grid grid-cols-4 gap-2">
          {RESOURCES.map(({ name, bar }) => (
            <li key={name} title={`${name} — wkrótce`}>
              <p className="truncate text-[0.65rem] text-bone-400">
                {name}
                <span className="sr-only">: brak danych</span>
              </p>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-abyss-700">
                <div className={`h-full w-full opacity-20 ${bar}`} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
