import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
  const [menuOpen, setMenuOpen] = useState(false);
  if (session.isLoading) return <p className="p-10 text-bone-400">Otwieranie ksiąg…</p>;
  if (!session.data) return <Navigate to="/logowanie" replace />;
  const staff = session.data;
  const closeMenu = () => {
    setMenuOpen(false);
  };
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-brass-500/20 bg-abyss-950/95 px-4 py-3 backdrop-blur md:hidden">
        <div>
          <p className="text-[10px] tracking-[0.28em] text-brass-500 uppercase">Zapomniany Brzeg</p>
          <p className="font-display text-2xl text-bone-50">Kancelaria</p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-brass-500/40 px-4 text-sm tracking-[0.14em] text-brass-300 uppercase"
          aria-expanded={menuOpen}
          aria-controls="menu-kancelarii"
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
        >
          {menuOpen ? 'Zamknij' : 'Menu'}
        </button>
      </header>
      {menuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          aria-label="Zamknij menu"
          onClick={closeMenu}
        />
      ) : null}
      <aside
        id="menu-kancelarii"
        className={`${menuOpen ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-72 flex-col border-r border-brass-500/20 bg-abyss-900 px-5 py-6 md:static md:flex md:w-auto`}
      >
        <p className="hidden text-xs tracking-[0.28em] text-brass-500 uppercase md:block">
          Zapomniany Brzeg
        </p>
        <p className="hidden font-display text-3xl text-bone-50 md:block">Kancelaria</p>
        <nav className="mt-2 flex flex-col gap-1 md:mt-8">
          {navFor(staff.role).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeMenu}
              className={({ isActive }) =>
                `min-h-11 rounded-lg px-3 py-3 text-sm md:py-2 ${isActive ? 'bg-abyss-700 text-brass-300' : 'text-bone-200 hover:bg-abyss-800'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 pt-6 text-sm">
          <p className="text-bone-400">{ROLE_LABELS[staff.role]}</p>
          <p className="truncate text-bone-600">{staff.email}</p>
          <button
            type="button"
            className="min-h-11 text-brass-300"
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
      <main className="min-w-0 px-4 py-4 md:px-8 md:py-8">
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
