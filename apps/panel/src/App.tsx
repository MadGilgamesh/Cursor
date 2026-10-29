import { useQueryClient } from '@tanstack/react-query';
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router';

import { api } from './api.js';
import { homeFor, navFor, ROLE_LABELS } from './nav.js';
import {
  AnnouncementsPage,
  AuditPage,
  ContentPage,
  EventPage,
  EventsPage,
  LoginPage,
  PlayerPage,
  PlayersPage,
  PublicationsPage,
  RecordPage,
} from './pages.js';
import { useSession } from './session.js';

function Shell() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (session.isLoading) return <p className="p-10 text-bone-400">Otwieranie ksiąg…</p>;
  if (!session.data) return <Navigate to="/logowanie" replace />;
  const staff = session.data;
  return (
    <div className="grid min-h-screen grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="flex flex-col border-r border-brass-500/20 bg-abyss-900/80 px-5 py-6">
        <p className="text-xs tracking-[0.28em] text-brass-500 uppercase">Zapomniany Brzeg</p>
        <p className="font-display text-3xl text-bone-50">Kancelaria</p>
        <nav className="mt-8 flex flex-col gap-1">
          {navFor(staff.role).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-abyss-700 text-brass-300' : 'text-bone-200 hover:bg-abyss-800'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 text-sm">
          <p className="text-bone-400">{ROLE_LABELS[staff.role]}</p>
          <p className="truncate text-bone-600">{staff.email}</p>
          <button
            type="button"
            className="text-brass-300"
            onClick={() => {
              void api('/api/panel/logout', { method: 'POST' }).then(async () => {
                await queryClient.invalidateQueries({ queryKey: ['session'] });
                void navigate('/logowanie');
              });
            }}
          >
            Wyjdź
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function Home() {
  const session = useSession();
  if (!session.data) return null;
  return <Navigate to={homeFor(session.data.role)} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/logowanie" element={<LoginPage />} />
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="/gracze" element={<PlayersPage />} />
        <Route path="/gracze/:accountId" element={<PlayerPage />} />
        <Route path="/audyt" element={<AuditPage />} />
        <Route path="/ogloszenia" element={<AnnouncementsPage />} />
        <Route path="/tresc" element={<ContentPage />} />
        <Route path="/tresc/:collection/:id" element={<RecordPage />} />
        <Route path="/eventy" element={<EventsPage />} />
        <Route path="/eventy/:id" element={<EventPage />} />
        <Route path="/publikacje" element={<PublicationsPage />} />
      </Route>
    </Routes>
  );
}
