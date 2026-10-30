import { useAwakening, useHall } from '../api/lodge';
import { t } from '../i18n';

/** Sala Lóż i tygodniowe Przebudzenie Boga. */
export function CommunityScreen() {
  const hall = useHall();
  const awakening = useAwakening();
  const rows = hall.data?.hall ?? [];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-bone-50">{t('community.title')}</h1>
      <section data-testid="lodge-hall" className="panel space-y-1 p-4">
        <h2 className="font-display text-xl text-brass-300">{t('community.hall')}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-bone-400">{t('community.empty')}</p>
        ) : (
          rows.map((lodge) => (
            <p key={lodge.id} className="text-sm text-bone-200">
              {lodge.name} — poziom {lodge.level}, {lodge.members}/{lodge.seats}
            </p>
          ))
        )}
      </section>
      <section className="panel space-y-1 p-4">
        <h2 className="font-display text-xl text-brass-300">{t('community.awakening')}</h2>
        <p className="text-sm text-bone-200">
          {awakening.data ? t('community.awakeningHint', { name: awakening.data.domainName }) : '…'}
        </p>
      </section>
      <section className="panel space-y-1 p-4">
        <h2 className="font-display text-xl text-brass-300">{t('community.dreams')}</h2>
        <p className="text-sm text-bone-400">{t('community.dreamsHint')}</p>
      </section>
    </div>
  );
}
