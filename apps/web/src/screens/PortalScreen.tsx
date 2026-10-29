import { usePortal, usePortalFight, useReforge } from '../api/portal';
import { errorMessage, t } from '../i18n';

/** Brama Srebrnego Klucza — walka w Międzysnie (GDD 5.12). */
export function PortalScreen() {
  const portal = usePortal();
  const fight = usePortalFight();
  const reforge = useReforge();
  const view = portal.data;
  const next = view?.next;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-bone-50">{t('home.portalTitle')}</h1>
      {view ? (
        <section className="panel space-y-2 p-4">
          <p data-testid="portal-key-count" className="text-sm text-bone-200">
            {t('home.portalKeys', { keys: view.keys.total })}
            {view.keys.shards > 0 ? ` · odłamki ${view.keys.shards}/5` : ''}
          </p>
          <p className="text-sm text-bone-400">
            {next?.open
              ? `${next.place}. ${next.modifier}. ${t('home.portalNext', { name: next.name })}`
              : 'Sen tej Domeny jest jeszcze zamknięty.'}
          </p>
          <p className="text-sm text-bone-400">
            Studnia: piętro {view.well.floor}/{view.well.max}. Świece: {view.candles}.
          </p>
          <p data-testid="portal-altar" className="text-sm text-bone-200">
            Ołtarz Bramy: Sigil Bokruga {view.altar.bokrugSigils}, Sigil Koloru{' '}
            {view.altar.colourSigils}. Ichor {view.altar.ichor}. Przekuć dziś:{' '}
            {view.altar.reforgeLeft}.
          </p>
          <button
            type="button"
            className="min-h-12 w-full rounded-xl bg-abyss-700 font-display text-bone-50"
            disabled={reforge.isPending || view.altar.reforgeLeft < 1 || view.keys.total < 3}
            onClick={() => {
              reforge.mutate(1);
            }}
          >
            Przekuj Sigil Bokruga
          </button>
          {next?.open ? (
            <button
              type="button"
              className="min-h-12 w-full rounded-xl bg-verdigris-700 font-display text-bone-50"
              disabled={fight.isPending || view.keys.total < 1}
              onClick={() => {
                fight.mutate({
                  domain: next.domain,
                  stage: next.stage,
                  substage: next.substage,
                });
              }}
            >
              Wejdź w sen
            </button>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-bone-400">{t('app.loading')}</p>
      )}
      {fight.data ? (
        <p role="status" data-testid="portal-result" className="text-sm text-bone-200">
          {fight.data.result.winner === 'player' ? 'Zwycięstwo' : 'Porażka'}
          {fight.data.firstClear ? ' · pierwsze przejście' : ''}
          {` · +${fight.data.experience} PD`}
        </p>
      ) : null}
      {fight.error || portal.error || reforge.error ? (
        <p role="alert" className="text-sm text-ichor-400">
          {errorMessage(fight.error ?? reforge.error ?? portal.error)}
        </p>
      ) : null}
    </div>
  );
}
