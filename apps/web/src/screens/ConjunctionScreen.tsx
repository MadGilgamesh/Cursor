import { useConjunction } from '../api/conjunction';
import { t } from '../i18n';

/** Obserwatorium Zegara Koniunkcji (GDD 6.7, Etap 9). */
export function ConjunctionScreen() {
  const view = useConjunction();
  const clock = view.data;
  const percent = clock ? (clock.clockBp / 100).toFixed(2) : '…';

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-bone-50">{t('conjunction.title')}</h1>
      <section data-testid="conjunction" className="panel space-y-2 p-4">
        <p className="text-sm text-bone-200">{t('conjunction.clock')}</p>
        <p className="font-display text-2xl text-brass-300">{percent}%</p>
        <p className="text-sm text-bone-400">{t('conjunction.deadNight')}</p>
        <p className="text-sm text-bone-400">{t('conjunction.domain')}</p>
      </section>
    </div>
  );
}
