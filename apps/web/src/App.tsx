import { Navigate, Route, Routes } from 'react-router';

import { useSession } from './api/auth';
import { errorMessage, t } from './i18n';
import { AppShell } from './layout/AppShell';
import { AuthScreen } from './screens/AuthScreen';
import { CharacterScreen } from './screens/CharacterScreen';
import { CityScreen } from './screens/CityScreen';
import { CommunityScreen } from './screens/CommunityScreen';
import { ConjunctionScreen } from './screens/ConjunctionScreen';
import { DescentScreen } from './screens/DescentScreen';
import { ExpeditionScreen } from './screens/ExpeditionScreen';
import { HearthScreen } from './screens/HearthScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LoreScreen } from './screens/LoreScreen';
import { MrokScreen } from './screens/MrokScreen';
import { PortScreen } from './screens/PortScreen';
import { PortalScreen } from './screens/PortalScreen';
import { RoadScreen } from './screens/RoadScreen';
import { Button } from './ui/Button';
import { Sigil } from './ui/Sigil';

function Splash({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center" aria-busy={!error}>
      <div>
        <Sigil className="mx-auto size-24 animate-pulse-slow" />
        {error ? (
          <>
            <p role="alert" className="mt-4 text-ichor-400">
              {error}
            </p>
            {onRetry ? (
              <Button variant="ghost" className="mt-4" onClick={onRetry}>
                {t('app.retry')}
              </Button>
            ) : null}
          </>
        ) : (
          <p className="mt-4 text-sm text-bone-400 italic">{t('app.loading')}</p>
        )}
      </div>
    </div>
  );
}

export function App() {
  const sessionQuery = useSession();

  if (sessionQuery.isPending) return <Splash />;
  if (sessionQuery.isError) {
    return (
      <Splash
        error={errorMessage(sessionQuery.error)}
        onRetry={() => void sessionQuery.refetch()}
      />
    );
  }

  const session = sessionQuery.data;
  if (!session) {
    return (
      <Routes>
        <Route path="/logowanie" element={<AuthScreen key="login" mode="login" />} />
        <Route path="/rejestracja" element={<AuthScreen key="register" mode="register" />} />
        <Route path="*" element={<Navigate to="/logowanie" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell session={session} />}>
        <Route index element={<HomeScreen />} />
        <Route path="droga" element={<RoadScreen />} />
        <Route path="port" element={<PortScreen />} />
        <Route path="miasto" element={<CityScreen />} />
        <Route path="mrok" element={<MrokScreen />} />
        <Route path="portal" element={<PortalScreen />} />
        <Route path="wiedza" element={<LoreScreen />} />
        <Route path="postac" element={<CharacterScreen />} />
        <Route path="wspolnota" element={<CommunityScreen />} />
        <Route path="dom" element={<HearthScreen />} />
        <Route path="wyprawy" element={<ExpeditionScreen />} />
        <Route path="koniunkcja" element={<ConjunctionScreen />} />
        <Route path="zstapienie" element={<DescentScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
