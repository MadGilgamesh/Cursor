import { findMission, WEATHER_NAMES, type Activity, type WeatherId } from '@game/shared';
import { useEffect } from 'react';
import { Link } from 'react-router';

import {
  newIdempotencyKey,
  useClaimActivity,
  useClaimAll,
  useDashboard,
  useServerNow,
} from '../api/game';
import { isReady, nextStep, resourceViews } from '../game/state';
import { errorMessage, formatDuration, t } from '../i18n';
import { useCurrentPlayer } from '../layout/current-player';
import { Button } from '../ui/Button';
import { Sigil } from '../ui/Sigil';
import { XpBar } from '../ui/XpBar';

const missionName = (activity: Activity) => findMission(activity.defId)?.name ?? activity.defId;

export function HomeScreen() {
  const session = useCurrentPlayer();
  const dashboard = useDashboard();
  const now = useServerNow(dashboard.data?.clockOffsetMs ?? 0);
  const claim = useClaimActivity();
  const claimAll = useClaimAll();
  const character = dashboard.data?.character ?? session.character;
  const activities = dashboard.data?.activities ?? [];
  const ready = activities.filter((activity) => isReady(activity, now));
  const running = activities.filter((activity) => !isReady(activity, now));

  // Gdy timer dobiegnie końca, pobieramy rozstrzygnięty wynik z serwera.
  const nextEnd = Math.min(...running.map((activity) => Date.parse(activity.endAt)));
  const { refetch } = dashboard;
  useEffect(() => {
    if (!Number.isFinite(nextEnd)) return;
    const timer = setTimeout(() => void refetch(), Math.max(0, nextEnd - now) + 500);
    return () => {
      clearTimeout(timer);
    };
    // `now` celowo pomijamy — timer ustawiamy raz na każdy koniec zlecenia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextEnd, refetch]);

  const madness = dashboard.data?.lore;
  useEffect(() => {
    const root = document.documentElement;
    if (!madness?.madnessUi || madness.sanityTier === 'calm' || madness.sanityTier === 'broken') {
      delete root.dataset.madness;
      return;
    }
    root.dataset.madness = madness.sanityTier;
  }, [madness]);

  const pace = dashboard.data?.regen;
  const vigor = dashboard.data
    ? resourceViews(dashboard.data.resources, now, pace).find((view) => view.kind === 'vigor')
    : undefined;
  const step = vigor ? nextStep(activities, vigor, now, pace) : null;
  const actionError = claim.error ?? claimAll.error;

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="home-title"
        className="panel relative overflow-hidden px-5 pt-4 pb-4 text-center"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_40%,rgb(62_159_134/0.25),transparent_70%)]" />
        <Sigil className="relative mx-auto size-24 animate-pulse-slow" />
        <h1
          id="home-title"
          className="relative mt-1 font-display text-4xl font-bold tracking-[0.12em] text-bone-50"
        >
          {t('home.title')}
        </h1>
        <p className="relative mt-1 text-sm text-bone-400 italic">{t('home.subtitle')}</p>
      </section>

      {step ? (
        <section aria-label={t('home.nextStep')} className="panel border-verdigris-500/40 p-4">
          <h2 className="font-display text-lg font-semibold text-verdigris-300">
            {t('home.nextStep')}
          </h2>
          <p data-testid="next-step" className="mt-1 text-sm text-bone-200">
            {step.kind === 'claim' && t('home.nextClaim')}
            {step.kind === 'wait' && t('home.nextWait', { time: formatDuration(step.at - now) })}
            {step.kind === 'board' && t('home.nextBoard', { vigor: step.vigor })}
            {step.kind === 'rest' && t('home.nextRest', { time: formatDuration(step.at - now) })}
          </p>
          {step.kind === 'board' ? (
            <Link
              to="/miasto"
              className="mt-3 inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
            >
              {t('home.goToBoard')} →
            </Link>
          ) : null}
        </section>
      ) : null}

      {dashboard.data ? (
        <section aria-label={t('home.worldTitle')} className="panel p-4">
          <h2 className="font-display text-lg font-semibold text-brass-300">
            {t('home.worldTitle')}
          </h2>
          <p data-testid="home-city" className="mt-1 text-sm text-bone-200">
            {t('home.worldCity', { city: dashboard.data.world.cityName })}
          </p>
          <p className="text-sm text-bone-400">
            {t('home.worldWeather', {
              weather:
                dashboard.data.world.weather in WEATHER_NAMES
                  ? WEATHER_NAMES[dashboard.data.world.weather as WeatherId]
                  : dashboard.data.world.weather,
              tide: dashboard.data.world.tide === 'high' ? 'przypływ' : 'odpływ',
            })}{' '}
            {dashboard.data.world.wolfHour ? t('home.worldWolf') : t('home.worldDay')}
          </p>
          <p className="text-sm text-bone-400">
            {t('home.worldThirsty', { count: dashboard.data.world.thirsty })}
          </p>
          <Link
            to="/droga"
            className="mt-3 inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
          >
            {t('home.worldRoad')} →
          </Link>
          <Link
            to="/port"
            className="mt-3 ml-4 inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
          >
            {t('home.portEnter')} →
          </Link>
        </section>
      ) : null}

      {dashboard.data ? (
        <section aria-label={t('home.lodgeTitle')} className="panel p-4">
          <h2 className="font-display text-lg font-semibold text-brass-300">
            {t('home.lodgeTitle')}
          </h2>
          <p className="mt-1 text-sm text-bone-400">{t('home.lodgeHint')}</p>
          <Link
            to="/wspolnota"
            className="mt-3 inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
          >
            {t('home.lodgeEnter')} →
          </Link>
        </section>
      ) : null}

      {dashboard.data ? (
        <section aria-label={t('home.hearthTitle')} className="panel p-4">
          <h2 className="font-display text-lg font-semibold text-brass-300">
            {t('home.hearthTitle')}
          </h2>
          <p className="mt-1 text-sm text-bone-400">{t('home.hearthHint')}</p>
          <Link
            to="/dom"
            className="mt-3 inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
          >
            {t('home.hearthEnter')} →
          </Link>
        </section>
      ) : null}

      {dashboard.data ? (
        <section aria-label={t('home.expeditionTitle')} className="panel p-4">
          <h2 className="font-display text-lg font-semibold text-brass-300">
            {t('home.expeditionTitle')}
          </h2>
          <p className="mt-1 text-sm text-bone-400">{t('home.expeditionHint')}</p>
          <Link
            to="/wyprawy"
            className="mt-3 inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
          >
            {t('home.expeditionEnter')} →
          </Link>
        </section>
      ) : null}

      {dashboard.data ? (
        <section aria-label={t('home.conjunctionTitle')} className="panel p-4">
          <h2 className="font-display text-lg font-semibold text-brass-300">
            {t('home.conjunctionTitle')}
          </h2>
          <p className="mt-1 text-sm text-bone-400">{t('home.conjunctionHint')}</p>
          <Link
            to="/koniunkcja"
            className="mt-3 inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
          >
            {t('home.conjunctionEnter')} →
          </Link>
        </section>
      ) : null}

      {dashboard.data ? (
        <section aria-label={t('home.descentTitle')} className="panel p-4">
          <h2 className="font-display text-lg font-semibold text-brass-300">
            {t('home.descentTitle')}
          </h2>
          <p className="mt-1 text-sm text-bone-400">{t('home.descentHint')}</p>
          <Link
            to="/zstapienie"
            className="mt-3 inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
          >
            {t('home.descentEnter')} →
          </Link>
        </section>
      ) : null}

      {dashboard.data ? (
        <section aria-label={t('home.portalTitle')} className="panel p-4">
          <h2 className="font-display text-lg font-semibold text-brass-300">
            {t('home.portalTitle')}
          </h2>
          <p data-testid="portal-keys" className="mt-1 text-sm text-bone-200">
            {t('home.portalKeys', { keys: dashboard.data.portal.totalKeys })}
          </p>
          <p className="text-sm text-bone-400">
            {dashboard.data.portal.totalKeys > 0
              ? t('home.portalNext', { name: dashboard.data.portal.nextName })
              : t('home.portalEmpty')}
          </p>
          <Link
            to="/portal"
            className="mt-3 inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
          >
            {t('home.portalEnter')} →
          </Link>
        </section>
      ) : null}

      {dashboard.data ? (
        <section aria-label={t('home.loreTitle')} className="panel p-4">
          <h2 className="font-display text-lg font-semibold text-brass-300">
            {t('home.loreTitle')}
          </h2>
          <p data-testid="lore-knowledge" className="mt-1 text-sm text-bone-200">
            {t('home.loreKnowledge', { knowledge: dashboard.data.lore.knowledge })}
          </p>
          <p className="text-sm text-bone-400">
            {dashboard.data.lore.caseOpen ? t('home.loreCase') : t('home.loreCaseEmpty')}
          </p>
          <p className="text-sm text-bone-400">
            {t('home.loreReforge', { left: dashboard.data.lore.reforgeLeft })}
          </p>
          <p className="text-sm text-bone-400">
            {t('home.loreSigils', { count: dashboard.data.lore.colourSigils })}
          </p>
          <p className="text-sm text-bone-400">
            {t('home.loreChapel', {
              composure: dashboard.data.lore.composure,
              insight: dashboard.data.lore.insight,
              stealth: dashboard.data.lore.stealth,
            })}
          </p>
          <p className="text-sm text-bone-400">
            {t('home.loreScars', {
              count: dashboard.data.lore.scars.length,
              residents: dashboard.data.lore.residents,
            })}
          </p>
          <p className="text-sm text-bone-400">
            {dashboard.data.lore.readingEndsAt || dashboard.data.lore.collegeEndsAt
              ? t('home.loreBusy')
              : t('home.loreShelf')}
          </p>
          <Link
            to="/wiedza"
            className="mt-3 inline-block font-display font-semibold text-brass-300 underline-offset-4 hover:underline"
          >
            {t('home.loreEnter')} →
          </Link>
        </section>
      ) : null}

      <section
        aria-label={t('home.characterSection')}
        className="panel flex items-center gap-4 p-4"
      >
        <div className="grid h-16 w-13 shrink-0 place-items-center rounded-[50%] border border-brass-500/60 bg-abyss-800 font-display text-3xl text-brass-300">
          {character.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate font-display text-xl font-semibold text-bone-50">
              {character.name}
            </p>
            <p className="shrink-0 text-xs text-brass-300">
              {t('resources.levelShort', { level: character.level })}
            </p>
          </div>
          <p className="mb-2 text-xs text-bone-400">{t('home.awakened')}</p>
          <XpBar character={character} />
        </div>
      </section>

      <section aria-label={t('home.ready')}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-wide text-bone-200">
            {t('home.ready')}
          </h2>
          {ready.length > 1 ? (
            <button
              type="button"
              disabled={claimAll.isPending}
              onClick={() => {
                claimAll.mutate({ idempotencyKey: newIdempotencyKey() });
              }}
              className="font-display text-sm font-semibold text-brass-300"
            >
              {t('home.claimAll')}
            </button>
          ) : null}
        </div>
        {ready.length === 0 ? (
          <p className="panel px-4 py-3 text-sm text-bone-600 italic">{t('home.readyEmpty')}</p>
        ) : (
          <ul className="space-y-3">
            {ready.map((activity) => (
              <li key={activity.id} className="panel space-y-2 p-4">
                <p className="font-display font-semibold text-bone-50">{missionName(activity)}</p>
                {activity.result ? (
                  <>
                    <p className="text-sm text-bone-400 italic">{activity.result.outcome}</p>
                    <p className="text-sm text-verdigris-300">
                      {t('home.reward', {
                        experience: activity.result.experience,
                        silver: activity.result.silver,
                      })}
                    </p>
                  </>
                ) : null}
                <Button
                  disabled={claim.isPending}
                  onClick={() => {
                    claim.mutate({ activityId: activity.id, idempotencyKey: newIdempotencyKey() });
                  }}
                >
                  {t('home.claim')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {actionError ? (
          <p role="alert" className="mt-2 text-sm text-ichor-400">
            {errorMessage(actionError)}
          </p>
        ) : null}
      </section>

      <section aria-label={t('home.running')}>
        <h2 className="mb-2 font-display text-lg font-semibold tracking-wide text-bone-200">
          {t('home.running')}
        </h2>
        {running.length === 0 ? (
          <p className="panel px-4 py-3 text-sm text-bone-600 italic">{t('home.runningEmpty')}</p>
        ) : (
          <ul className="space-y-3">
            {running.map((activity) => {
              const start = Date.parse(activity.startAt);
              const end = Date.parse(activity.endAt);
              const percent = Math.min(100, ((now - start) / (end - start)) * 100);
              return (
                <li key={activity.id} className="panel p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-display font-semibold text-bone-50">
                      {missionName(activity)}
                    </p>
                    <p
                      data-testid="activity-remaining"
                      className="shrink-0 text-xs text-bone-400 tabular-nums"
                    >
                      {t('home.remaining', { time: formatDuration(end - now) })}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-abyss-700">
                    <div className="h-full bg-vigor-400" style={{ width: `${percent}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label={t('home.today')}>
        <h2 className="mb-2 font-display text-lg font-semibold tracking-wide text-bone-200">
          {t('home.today')}
        </h2>
        <p className="panel px-4 py-3 text-sm text-bone-600 italic">{t('home.todayEmpty')}</p>
      </section>
    </div>
  );
}
