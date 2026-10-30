import { useHearth } from '../api/hearth';
import { t } from '../i18n';

/** Próg domu: Skażenie, Przysięga i kryjówka. Reszta rytuałów zostaje na serwerze. */
export function HearthScreen() {
  const hearth = useHearth();
  const data = hearth.data;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-bone-50">{t('hearth.title')}</h1>
      <section data-testid="hearth" className="panel space-y-2 p-4">
        <p className="text-sm text-bone-200">
          {t('hearth.contamination', { value: data?.contamination ?? 0 })}
        </p>
        {data?.oath ? (
          <p className="text-sm text-bone-200">
            {t('hearth.oath', { name: data.oath.name, circle: data.oath.circle })}
          </p>
        ) : (
          <p className="text-sm text-bone-400">{data ? t('hearth.oathEmpty') : '…'}</p>
        )}
        <p className="text-sm text-bone-400">
          {data?.hideout ? t('hearth.hideout') : t('hearth.hideoutClosed')}
        </p>
        {data?.cult ? (
          <p className="text-sm text-bone-200">
            {t('hearth.cult', { rank: data.cult.rank, suspicion: data.cult.suspicion })}
          </p>
        ) : null}
      </section>
    </div>
  );
}
