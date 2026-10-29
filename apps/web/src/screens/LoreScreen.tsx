import { useLore, useOpenCase, useSetMadness, useTakeClue, useTrainChapel } from '../api/lore';
import { errorMessage, t } from '../i18n';

const QUESTION_LABEL: Record<string, string> = {
  who: 'Kto?',
  where: 'Gdzie?',
  intent: 'Co zamierzają?',
};

/** Notatnik: Sprawy, Kaplica i wyłącznik obłędu (GDD 6). */
export function LoreScreen() {
  const lore = useLore();
  const open = useOpenCase();
  const clue = useTakeClue();
  const chapel = useTrainChapel();
  const madness = useSetMadness();
  const view = lore.data;
  const error = open.error ?? clue.error ?? chapel.error ?? madness.error;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-bone-50">{t('home.loreTitle')}</h1>
      {view ? (
        <>
          <p data-testid="lore-screen-knowledge" className="text-sm text-bone-200">
            {t('home.loreKnowledge', { knowledge: view.knowledge })}
          </p>
          <button
            type="button"
            data-testid="madness-toggle"
            className="text-sm text-brass-300 underline"
            onClick={() => {
              madness.mutate({ enabled: !view.madnessUi });
            }}
          >
            {view.madnessUi ? t('home.madnessOn') : t('home.madnessOff')}
          </button>
          <section className="panel space-y-2 p-4">
            <h2 className="font-display text-xl text-brass-300">Sprawa</h2>
            {view.case ? (
              view.case.questions.map((question) => (
                <div key={question.id}>
                  <p className="text-sm text-bone-50">{question.prompt}</p>
                  <p className="text-xs text-bone-400">{question.options.join(' · ')}</p>
                  {view.case?.clues
                    .filter((entry) => entry.question === question.id && entry.source === 'search')
                    .map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="mt-2 min-h-12 w-full rounded-xl bg-verdigris-700 font-display text-bone-50"
                        disabled={entry.found || clue.isPending}
                        onClick={() => {
                          clue.mutate({ clueId: entry.id });
                        }}
                      >
                        {entry.found
                          ? `Trop: wskazanie ${entry.supports ?? '—'}`
                          : `Przeszukanie: ${QUESTION_LABEL[question.id] ?? question.prompt}`}
                      </button>
                    ))}
                </div>
              ))
            ) : (
              <button
                type="button"
                className="min-h-12 w-full rounded-xl bg-verdigris-700 font-display text-bone-50"
                disabled={open.isPending}
                onClick={() => {
                  open.mutate({});
                }}
              >
                Otwórz sprawę
              </button>
            )}
          </section>
          <section className="panel space-y-2 p-4">
            <h2 className="font-display text-xl text-brass-300">Mieszkańcy</h2>
            {view.residents.map((resident) => (
              <p key={resident.id} className="text-sm text-bone-200">
                {resident.gone
                  ? `${resident.name} zniknął.`
                  : `${resident.name}, zażyłość ${resident.familiarity}`}
              </p>
            ))}
          </section>
          <section className="panel space-y-2 p-4">
            <h2 className="font-display text-xl text-brass-300">Kaplica Latarników</h2>
            <p className="text-sm text-bone-400">
              Opanowanie {view.chapel.composure}, Wgląd {view.chapel.insight}, Skrytość{' '}
              {view.chapel.stealth}
            </p>
            <button
              type="button"
              className="min-h-12 w-full rounded-xl bg-abyss-700 font-display text-bone-50"
              disabled={chapel.isPending}
              onClick={() => {
                chapel.mutate({ stat: 'composure' });
              }}
            >
              Trenuj opanowanie
            </button>
          </section>
          <section className="panel space-y-1 p-4">
            <h2 className="font-display text-xl text-brass-300">Kolegium</h2>
            <p className="text-sm text-bone-400">
              {view.college.courseId
                ? `Kurs trwa: ${view.college.courseId}`
                : 'Anatomia Walki, Służba Zakonu, Rzemiosło, Polityka i Handel, Nauki Wzbronione.'}
            </p>
            <p className="text-sm text-bone-400">Zaliczone: {view.college.done.length}</p>
          </section>
          <section className="panel space-y-1 p-4">
            <h2 className="font-display text-xl text-brass-300">Konstelacja i tomy</h2>
            <p className="text-sm text-bone-200">
              Punkty: {view.constellation.points}. Gwiazdy: {view.constellation.nodes.length}.
              {view.constellation.extinctOpen ? ' Wygasłe gwiazdy są odsłonięte.' : ''}
            </p>
            <p className="text-sm text-bone-400">
              Przeczytane tomy: {view.booksRead.length === 0 ? 'żaden' : view.booksRead.join(', ')}
            </p>
            <p className="text-sm text-bone-400">Blizny Umysłu: {view.scars.length}</p>
          </section>
          <section className="panel space-y-1 p-4" data-testid="lore-factions">
            <h2 className="font-display text-xl text-brass-300">Frakcje Soli</h2>
            {view.factions.map((faction) => (
              <p key={faction.id} className="text-sm text-bone-200">
                {faction.name}: ranga {faction.rank}, pieczęcie {faction.seals}
              </p>
            ))}
          </section>
          <section className="panel space-y-1 p-4">
            <h2 className="font-display text-xl text-brass-300">Bestiariusz</h2>
            <p data-testid="lore-bestiary" className="text-sm text-bone-200">
              Odkryte strony: {view.bestiaryPages}
            </p>
          </section>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-ichor-400">
          {errorMessage(error)}
        </p>
      ) : null}
    </div>
  );
}
