import { useCurrentPlayer } from '../layout/current-player';
import { Sigil } from '../ui/Sigil';
import { XpBar } from '../ui/XpBar';

/**
 * Sekcje pulpitu Dom wg GDD 3.3. Zapełnią je timery (`TimedActivity`) z kolejnych etapów.
 */
const DASHBOARD_SECTIONS = [
  { title: 'Gotowe do odbioru', empty: 'Nic nie czeka na odbiór.' },
  { title: 'Trwa', empty: 'Żaden timer nie odlicza.' },
  { title: 'Do zrobienia dziś', empty: 'Dzienne zadania pojawią się wkrótce.' },
] as const;

export function HomeScreen() {
  const { character } = useCurrentPlayer();

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="home-title"
        className="panel relative overflow-hidden px-5 pt-5 pb-5 text-center"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_40%,rgb(62_159_134/0.25),transparent_70%)]" />
        <Sigil className="relative mx-auto size-36 animate-pulse-slow" />
        <h1
          id="home-title"
          className="relative mt-2 font-display text-4xl font-bold tracking-[0.12em] text-bone-50"
        >
          Dom
        </h1>
        <p className="relative mt-1 text-sm text-bone-400 italic">
          Sól, Zapomniany Brzeg. Latarnie wciąż milczą.
        </p>
      </section>

      <section aria-label="Twoja postać" className="panel flex items-center gap-4 p-4">
        <div className="grid h-16 w-13 shrink-0 place-items-center rounded-[50%] border border-brass-500/60 bg-abyss-800 font-display text-3xl text-brass-300">
          {character.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate font-display text-xl font-semibold text-bone-50">
              {character.name}
            </p>
            <p className="shrink-0 text-xs text-brass-300">Poz. {character.level}</p>
          </div>
          <p className="mb-2 text-xs text-bone-400">Przebudzony</p>
          <XpBar character={character} />
        </div>
      </section>

      {DASHBOARD_SECTIONS.map(({ title, empty }) => (
        <section key={title} aria-label={title}>
          <h2 className="mb-2 font-display text-lg font-semibold tracking-wide text-bone-200">
            {title}
          </h2>
          <p className="panel px-4 py-3 text-sm text-bone-600 italic">{empty}</p>
        </section>
      ))}
    </div>
  );
}
