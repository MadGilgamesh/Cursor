import type { SessionResponse } from '@game/shared';
import { useState } from 'react';

import { useDashboard, useServerNow } from '../api/game';
import { resourceViews, type ResourceView } from '../game/state';
import { formatDuration, t } from '../i18n';

const BAR_COLORS: Record<ResourceView['kind'], string> = {
  life: 'bg-life-500',
  vigor: 'bg-vigor-400',
  toil: 'bg-toil-400',
  sanity: 'bg-sanity-400',
};

function describe(view: ResourceView, now: number): string {
  const params = { name: t(`resources.${view.kind}`), value: view.value, max: view.max };
  return view.fullAt === null
    ? t('resources.full', params)
    : t('resources.fullIn', { ...params, time: formatDuration(view.fullAt - now) });
}

/** Górny pasek gracza (GDD 3.3): portret, imię, poziom, Srebro i zasoby; dotknięcie paska pokazuje czas do pełna. */
export function TopBar({ session }: { session: SessionResponse }) {
  const dashboard = useDashboard();
  const now = useServerNow(dashboard.data?.clockOffsetMs ?? 0);
  const [selected, setSelected] = useState<ResourceView['kind'] | null>(null);
  const character = dashboard.data?.character ?? session.character;
  const views = dashboard.data
    ? resourceViews(dashboard.data.resources, now, dashboard.data.regen)
    : [];
  const selectedView = views.find((view) => view.kind === selected);

  return (
    <header className="pt-safe sticky top-0 z-10 border-b border-brass-700/40 bg-abyss-950/90 px-4 pb-2 backdrop-blur">
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-[50%] border-2 border-brass-500 bg-abyss-800 font-display text-xl text-brass-300"
          >
            {character.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p
              data-testid="character-name"
              className="truncate font-display text-lg font-semibold text-bone-50"
            >
              {character.name}
            </p>
            <p data-testid="character-level" className="text-xs text-bone-400">
              {t('resources.level', { level: character.level })}
            </p>
          </div>
          <p
            data-testid="wallet-silver"
            className="flex items-center gap-1.5 rounded-full border border-abyss-600 bg-abyss-900 py-1 pr-2.5 pl-1.5 text-xs text-bone-200"
          >
            <span aria-hidden="true" className="size-3 rounded-full bg-bone-200 shadow-glow" />
            <span className="sr-only">{t('resources.silver')}: </span>
            {dashboard.data ? dashboard.data.wallet.silver : '—'}
          </p>
        </div>
        <ul aria-label={t('resources.listLabel')} className="mt-2 grid grid-cols-4 gap-2">
          {views.map((view) => (
            <li key={view.kind}>
              <button
                type="button"
                data-testid={`resource-${view.kind}`}
                aria-label={describe(view, now)}
                aria-pressed={selected === view.kind}
                onClick={() => {
                  setSelected((current) => (current === view.kind ? null : view.kind));
                }}
                className="block w-full text-left"
              >
                <span className="flex items-baseline justify-between gap-1 text-[0.65rem] text-bone-400">
                  <span className="truncate">{t(`resources.${view.kind}`)}</span>
                  <span className="shrink-0 text-bone-200 tabular-nums">{view.value}</span>
                </span>
                <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-abyss-700">
                  <span
                    className={`block h-full ${BAR_COLORS[view.kind]}`}
                    style={{ width: `${Math.min(100, (view.value / view.max) * 100)}%` }}
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selectedView ? (
          <p role="status" className="mt-1.5 text-center text-xs text-bone-400">
            {describe(selectedView, now)}
          </p>
        ) : null}
      </div>
    </header>
  );
}
