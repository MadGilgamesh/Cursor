import { useNavigate } from 'react-router';

import { useLogout } from '../api/auth';
import { useDashboard } from '../api/game';
import { useEquip, useInventory, useProfile } from '../api/stage1';
import { locale, t } from '../i18n';
import { useCurrentPlayer } from '../layout/current-player';
import { PushSettings } from '../push/PushSettings';
import { Button } from '../ui/Button';
import { XpBar } from '../ui/XpBar';

export function CharacterScreen() {
  const session = useCurrentPlayer();
  const dashboard = useDashboard();
  const character = dashboard.data?.character ?? session.character;
  const logout = useLogout();
  const navigate = useNavigate();
  const profile = useProfile();
  const inventory = useInventory();
  const equip = useEquip();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold tracking-wide text-bone-50">
        {t('character.title')}
      </h1>

      <section className="panel p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-2xl font-semibold text-bone-50">{character.name}</p>
          <p className="font-display text-lg text-brass-300">
            {t('resources.level', { level: character.level })}
          </p>
        </div>
        <p className="mb-3 text-xs text-bone-400">{t('character.order')}</p>
        <XpBar character={character} />
        <p className="mt-3 text-sm text-bone-600 italic">{t('character.statsSoon')}</p>
      </section>

      {profile.data ? (
        <section className="panel p-4 text-sm text-bone-200" aria-label="Statystyki">
          <p>
            Siła {profile.data.stats.strength} · Hart {profile.data.stats.defense} · Celność{' '}
            {profile.data.stats.accuracy} · Unik {profile.data.stats.evasion}
          </p>
          <p data-testid="active-class">
            Klasa: {profile.data.classId ?? 'brak'} (poziom {profile.data.classLevel})
          </p>
        </section>
      ) : null}
      <section aria-label="Ekwipunek" className="space-y-2">
        {inventory.data?.items.map((item) => (
          <div key={item.id} className="panel flex items-center justify-between p-3 text-sm">
            <span>{item.name}</span>
            {item.equippedSlot ? (
              <span className="text-brass-300">założone</span>
            ) : item.defId.startsWith('gear.') ? (
              <button
                type="button"
                className="text-brass-300"
                onClick={() => {
                  equip.mutate({ itemId: item.id });
                }}
              >
                Załóż
              </button>
            ) : null}
          </div>
        ))}
      </section>
      <PushSettings />

      <section className="panel space-y-1 p-4">
        <p className="text-xs tracking-widest text-bone-400 uppercase">{t('character.account')}</p>
        <p className="text-sm text-bone-200">
          {t('character.awakenedOn', {
            date: new Date(session.account.createdAt).toLocaleDateString(locale),
          })}
        </p>
      </section>

      <Button
        variant="ghost"
        disabled={logout.isPending}
        onClick={() => {
          logout.mutate(undefined, {
            onSettled: () => void navigate('/logowanie', { replace: true }),
          });
        }}
      >
        {t('auth.logout')}
      </Button>
    </div>
  );
}
