import { useExpeditions } from '../api/expeditions';
import { t } from '../i18n';

/** Tablica wypraw 1–6. Lobby zostaje na serwerze; stąd widać zejścia i limity. */
export function ExpeditionScreen() {
  const hall = useExpeditions();
  const data = hall.data;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-bone-50">{t('expeditions.title')}</h1>
      <section data-testid="expeditions" className="panel space-y-3 p-4">
        {data
          ? data.catalog.map((entry) => (
              <article key={entry.id}>
                <h2 className="font-display text-lg text-brass-300">{entry.name}</h2>
                <p className="text-sm text-bone-400">
                  {t('expeditions.level', { level: entry.level })} ·{' '}
                  {t('expeditions.party', { party: entry.party })}
                </p>
                <p className="text-sm text-bone-200">
                  {t('expeditions.weekly', { remaining: entry.remaining })}
                </p>
              </article>
            ))
          : null}
        {!data ? <p className="text-sm text-bone-400">…</p> : null}
      </section>
    </div>
  );
}
