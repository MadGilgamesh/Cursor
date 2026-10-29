import {
  CITY_NAMES,
  CITY_RESIDENTS,
  CITIES,
  WEATHER_NAMES,
  type CityId,
  type WeatherId,
} from '@game/shared';
import { Link } from 'react-router';

import { useDashboard } from '../api/game';
import { useMeetResident, useTravel, useWorld } from '../api/world';
import { errorMessage, t } from '../i18n';
import { Button } from '../ui/Button';

const isCity = (value: string): value is CityId => (CITIES as readonly string[]).includes(value);

const weatherName = (value: string) =>
  value in WEATHER_NAMES ? WEATHER_NAMES[value as WeatherId] : value;

/** Droga między czterema miastami. Brama jest dostępna z każdego z nich. */
export function RoadScreen() {
  const world = useWorld();
  const dashboard = useDashboard();
  const travel = useTravel();
  const meet = useMeetResident();
  const view = world.data;
  const level = dashboard.data?.character.level ?? 1;
  const error = travel.error ?? meet.error;

  const here =
    view?.residents.filter((resident) => resident.city === view.city && !resident.gone) ?? [];
  const names = view && view.city !== 'salt' ? CITY_RESIDENTS[view.city] : [];
  const ready = view?.plots.filter((plot) => plot.phase === 'ready').length ?? 0;
  const thirsty = view?.plots.filter((plot) => plot.phase === 'thirsty').length ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-bone-50">{t('road.title')}</h1>
      {view ? (
        <>
          <p data-testid="road-city" className="text-sm text-bone-200">
            {t('home.worldCity', { city: view.cityName })}
          </p>
          <p data-testid="road-sky" className="text-sm text-bone-400">
            {t('home.worldWeather', {
              weather: weatherName(view.weather),
              tide: view.tide === 'high' ? 'przypływ' : 'odpływ',
            })}{' '}
            {view.wolfHour ? t('home.worldWolf') : t('home.worldDay')}
          </p>
          <p data-testid="road-reputation" className="text-sm text-bone-400">
            {t('road.reputation', { value: view.cityReputation[view.city] ?? 0 })}
          </p>
          {view.traveling ? (
            <p data-testid="road-travel" className="text-sm text-brass-300">
              {t('road.traveling')}
              {view.travelTo && isCity(view.travelTo) ? ` — ${CITY_NAMES[view.travelTo]}` : ''}
            </p>
          ) : (
            <div className="space-y-2">
              {CITIES.filter((city) => city !== view.city).map((city) => (
                <Button
                  key={city}
                  variant="ghost"
                  disabled={travel.isPending}
                  onClick={() => {
                    travel.mutate(city);
                  }}
                >
                  {city === 'salt'
                    ? t('road.departSalt')
                    : city === 'ilmar'
                      ? t('road.departIlmar')
                      : city === 'mire'
                        ? t('road.departMire')
                        : t('road.departBrink')}
                </Button>
              ))}
            </div>
          )}
          <p data-testid="road-garden" className="text-sm text-bone-400">
            {level < 8 ? t('road.gardenLocked') : t('road.garden', { ready, thirsty })}
          </p>
          <section className="panel space-y-2 p-4" data-testid="road-residents">
            <h2 className="font-display text-xl text-brass-300">{t('road.residents')}</h2>
            {view.city === 'salt' ? (
              <p className="text-sm text-bone-400">{t('road.saltResidents')}</p>
            ) : (
              here.map((resident) => {
                const name = names.find((person) => person.id === resident.id)?.name ?? resident.id;
                return (
                  <div key={resident.id} className="flex items-center justify-between gap-2">
                    <p className="text-sm text-bone-200">
                      {name} · {resident.familiarity}
                    </p>
                    <button
                      type="button"
                      className="text-sm text-brass-300 underline"
                      onClick={() => {
                        meet.mutate(resident.id);
                      }}
                    >
                      {t('road.meet')}
                    </button>
                  </div>
                );
              })
            )}
            {view.city === 'brink' ? (
              <p className="text-sm text-bone-400 italic">{t('road.pulse')}</p>
            ) : null}
          </section>
          <p className="text-sm text-bone-400">{t('road.portal')}</p>
          <Link
            to="/portal"
            className="inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
          >
            {t('home.portalEnter')} →
          </Link>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-ichor-400">
          {errorMessage(error)}
        </p>
      ) : null}
    </div>
  );
}
