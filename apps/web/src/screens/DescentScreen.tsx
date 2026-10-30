import { useDescent } from '../api/descent';
import { t } from '../i18n';

/** Zstąpienie, Piętna i próg Domen 10–11 (GDD 6.6, rozdz. 11). */
export function DescentScreen() {
  const view = useDescent();
  const descent = view.data;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-bone-50">{t('descent.title')}</h1>
      <section data-testid="descent" className="panel space-y-2 p-4">
        <p className="text-sm text-bone-200">{t('descent.gate')}</p>
        <p className="text-sm text-bone-400">{t('descent.yog')}</p>
        <p className="text-sm text-bone-400">{t('descent.azathoth')}</p>
        <p className="text-sm text-bone-400">{t('descent.ys')}</p>
        <p className="text-sm text-bone-400">{t('descent.eye')}</p>
        {descent ? (
          <p className="text-sm text-brass-300">
            {t('descent.marks', {
              training: descent.markTraining,
              mutation: descent.markMutation,
              constellation: descent.markConstellation,
              essence: descent.essence,
            })}
          </p>
        ) : null}
      </section>
    </div>
  );
}
