import { MISSIONS, missionExperience, missionSilver, missionTier } from '@game/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { newIdempotencyKey, useDashboard, useServerNow, useStartMission } from '../api/game';
import { useBuy } from '../api/stage1';
import { resourceViews } from '../game/state';
import { errorMessage, formatDuration, t } from '../i18n';
import { useCurrentPlayer } from '../layout/current-player';
import { Button } from '../ui/Button';

/** Miasto (GDD 3.3: usługi miejsca). W Etapie 0 działa tablica zleceń próbnych Urzędu. */
export function CityScreen() {
  const session = useCurrentPlayer();
  const dashboard = useDashboard();
  const now = useServerNow(dashboard.data?.clockOffsetMs ?? 0);
  const start = useStartMission();
  const buy = useBuy();
  const navigate = useNavigate();
  const level = dashboard.data?.character.level ?? session.character.level;
  const vigor = dashboard.data
    ? resourceViews(dashboard.data.resources, now).find((view) => view.kind === 'vigor')
    : undefined;
  const busy = (dashboard.data?.activities.length ?? 0) > 0;
  const [loop, setLoop] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide text-bone-50">
          {t('city.title')}
        </h1>
        <p className="mt-1 text-sm text-bone-400 italic">{t('city.subtitle')}</p>
      </div>

      <section aria-label="Sklep" className="panel space-y-2 p-4">
        <h2 className="font-display text-xl text-brass-300">Kram przy targu</h2>
        {['head', 'torso', 'legs', 'hands', 'feet'].map((slot) => (
          <button
            key={slot}
            type="button"
            className="block text-left text-sm text-bone-200 underline"
            onClick={() => {
              buy.mutate({ itemId: `gear.butcher.${slot}.1` });
            }}
          >
            Kup część Rzeźnika ({slot})
          </button>
        ))}
      </section>

      <section aria-labelledby="board-title" className="space-y-3">
        <div>
          <h2 id="board-title" className="font-display text-xl font-semibold text-brass-300">
            {t('city.board')}
          </h2>
          <p className="text-xs text-bone-600">{t('city.boardHint')}</p>
        </div>
        {busy ? <p className="text-sm text-bone-400">{t('city.busy')}</p> : null}
        <label className="flex items-center gap-2 text-sm text-bone-200">
          <input
            type="checkbox"
            checked={loop}
            onChange={(event) => {
              setLoop(event.target.checked);
            }}
          />
          W pętli (do 11 razy)
        </label>
        <ul className="space-y-3">
          {MISSIONS.map((mission) => {
            const tier = missionTier(mission.tierId);
            const affordable = vigor ? vigor.value >= tier.vigorCost : false;
            return (
              <li key={mission.id} className="panel space-y-2 p-4">
                <p className="font-display text-lg font-semibold text-bone-50">{mission.name}</p>
                <p className="text-sm text-bone-400">{mission.description}</p>
                <p className="flex flex-wrap gap-x-3 text-xs text-bone-200">
                  <span>{formatDuration(tier.durationMs)}</span>
                  <span className="text-vigor-400">{t('city.cost', { cost: tier.vigorCost })}</span>
                  <span className="text-verdigris-300">
                    {t('home.reward', {
                      experience: missionExperience(tier.vigorCost, level),
                      silver: missionSilver(tier.vigorCost, level),
                    })}
                  </span>
                </p>
                <Button
                  disabled={busy || !affordable || start.isPending || !dashboard.data}
                  aria-label={`${t('city.start')}: ${mission.name}`}
                  onClick={() => {
                    start.mutate(
                      { missionId: mission.id, loop, idempotencyKey: newIdempotencyKey() },
                      { onSuccess: () => void navigate('/') },
                    );
                  }}
                >
                  {start.isPending && start.variables.missionId === mission.id
                    ? t('city.starting')
                    : t('city.start')}
                </Button>
                {!busy && vigor && !affordable ? (
                  <p className="text-xs text-ichor-400">{t('city.noVigor')}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
        {start.error ? (
          <p role="alert" className="text-sm text-ichor-400">
            {errorMessage(start.error)}
          </p>
        ) : null}
      </section>
    </div>
  );
}
