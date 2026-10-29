import { Navigate, Route, Routes } from 'react-router';

import { useSession } from './api/auth';
import { AppShell } from './layout/AppShell';
import { AuthScreen } from './screens/AuthScreen';
import { CharacterScreen } from './screens/CharacterScreen';
import { HomeScreen } from './screens/HomeScreen';
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
                Spróbuj ponownie
              </Button>
            ) : null}
          </>
        ) : (
          <p className="mt-4 text-sm text-bone-400 italic">Mgła się rozstępuje…</p>
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
      <Splash error={sessionQuery.error.message} onRetry={() => void sessionQuery.refetch()} />
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
        <Route
          path="miasto"
          element={
            <PlaceholderScreen
              title="Miasto"
              description="Sól nocą: Kasa, Kuźnia Szarego Młota i Przytułek św. Agaty wciąż zamknięte na cztery spusty."
            />
          }
        />
        <Route
          path="mrok"
          element={
            <PlaceholderScreen
              title="Mrok"
              description="Łowy, Studnia Bez Dna i wyprawy czekają, aż coś wypełznie z morza."
            />
          }
        />
        <Route path="postac" element={<CharacterScreen />} />
        <Route
          path="wspolnota"
          element={
            <PlaceholderScreen
              title="Wspólnota"
              description="Loże, poczta i giełda ożyją, gdy na Brzegu zbierze się więcej Przebudzonych."
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
