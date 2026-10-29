import { Navigate, Route, Routes } from 'react-router';

import { useSession } from './api/auth';
import { errorMessage, t } from './i18n';
import { AppShell } from './layout/AppShell';
import { AuthScreen } from './screens/AuthScreen';
import { CharacterScreen } from './screens/CharacterScreen';
import { CityScreen } from './screens/CityScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MrokScreen } from './screens/MrokScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
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
        <Route path="miasto" element={<CityScreen />} />
        <Route path="mrok" element={<MrokScreen />} />
        <Route path="postac" element={<CharacterScreen />} />
        <Route
          path="wspolnota"
          element={
            <PlaceholderScreen
              title={t('community.title')}
              description={t('community.description')}
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
