import { usePort } from '../api/port';
import { t } from '../i18n';

/** Giełda, warsztaty i poczta. Klucze i Sigile nie wchodzą do księgi. */
export function PortScreen() {
  const port = usePort();
  const goods = Object.entries(port.data?.goods ?? {});
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-bone-50">{t('home.portTitle')}</h1>
      <p data-testid="port-board" className="text-sm text-bone-200">
        {t('home.portHint')}
      </p>
      <p className="text-sm text-bone-400">{t('home.portFees')}</p>
      <p className="text-sm text-bone-400">{t('home.portMail', { count: port.data?.mail ?? 0 })}</p>
      <section className="panel space-y-1 p-4">
        <h2 className="font-display text-xl text-brass-300">{t('home.portStock')}</h2>
        {goods.length === 0 ? (
          <p className="text-sm text-bone-400">{t('home.portStockEmpty')}</p>
        ) : (
          goods.map(([id, qty]) => (
            <p key={id} className="text-sm text-bone-200">
              {id}: {qty}
            </p>
          ))
        )}
      </section>
    </div>
  );
}
