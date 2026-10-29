import type { SessionResponse } from '@game/shared';
import { Outlet } from 'react-router';

import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';

export function AppShell({ session }: { session: SessionResponse }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar session={session} />
      {/* Dolny margines rezerwuje miejsce na stały pasek nawigacji. */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-32">
        <Outlet context={session} />
      </main>
      <BottomNav />
    </div>
  );
}
