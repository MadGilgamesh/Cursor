import { useFight, useHunts, useProfile, useTrain, useTutorial } from '../api/stage1';
import { errorMessage } from '../i18n';

/** Mrok: samouczek i Łowy (GDD 5.3). */
export function MrokScreen() {
  const profile = useProfile();
  const hunts = useHunts();
  const tutorial = useTutorial();
  const fight = useFight();
  const train = useTrain();
  const error = tutorial.error ?? fight.error;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-bone-50">Mrok</h1>
      {profile.data && !profile.data.tutorialDone ? (
        <section className="panel space-y-2 p-4">
          <h2 className="font-display text-xl text-brass-300">Przebudzenie w kostnicy</h2>
          <p className="text-sm text-bone-400">Ktoś pod sąsiednim prześcieradłem też się rusza.</p>
          <button
            type="button"
            className="min-h-12 w-full rounded-xl bg-verdigris-700 font-display text-bone-50"
            disabled={tutorial.isPending}
            onClick={() => {
              tutorial.mutate({});
            }}
          >
            Wstań ze stołu
          </button>
        </section>
      ) : null}
      <button
        type="button"
        className="text-sm text-brass-300 underline"
        onClick={() => {
          void (async () => {
            for (const stat of ['strength', 'defense', 'accuracy', 'evasion'] as const) {
              await train.mutateAsync({ stat, vigor: 20 });
            }
          })();
        }}
      >
        Trenuj ciało (80 Wigoru)
      </button>
      <section aria-label="Łowy" className="space-y-3">
        <h2 className="font-display text-xl text-brass-300">
          Łowy {hunts.data ? `· Krąg ${hunts.data.circle}` : ''}
        </h2>
        <ul className="space-y-2">
          {hunts.data?.targets.map((target) => (
            <li key={target.index} className="panel flex items-center justify-between gap-2 p-3">
              <span className="text-sm text-bone-50">
                {target.name}
                {target.named ? ' · nazwany' : ''}
              </span>
              <button
                type="button"
                className="min-h-10 rounded-lg border border-brass-500 px-3 text-sm text-brass-300"
                disabled={fight.isPending}
                onClick={() => {
                  fight.mutate({ index: target.index });
                }}
              >
                Walcz
              </button>
            </li>
          ))}
        </ul>
      </section>
      {(fight.data ?? tutorial.data) ? (
        <p role="status" data-testid="fight-result" className="text-sm text-bone-200">
          {((fight.data ?? tutorial.data) as { result: { winner: string; rounds: number } }).result
            .winner === 'player'
            ? 'Zwycięstwo'
            : 'Porażka'}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-ichor-400">
          {errorMessage(error)}
        </p>
      ) : null}
    </div>
  );
}
