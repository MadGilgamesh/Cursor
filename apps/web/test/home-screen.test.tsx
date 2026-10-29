import { IDEMPOTENCY_HEADER, type DashboardResponse, type SessionResponse } from '@game/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { TopBar } from '../src/layout/TopBar';
import { HomeScreen } from '../src/screens/HomeScreen';
import { jsonResponse, renderWithProviders } from './render';

const now = new Date();
const iso = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();

const session: SessionResponse = {
  account: { id: '01a188a0-a752-7a67-ae27-df35949e404a', createdAt: iso(-86_400_000) },
  character: {
    id: '01a188a0-a755-76ad-aeec-cbf3830cb2f6',
    name: 'Latarnik',
    level: 1,
    experience: 0,
    createdAt: iso(-86_400_000),
  },
};

const dashboard: DashboardResponse = {
  serverTime: iso(0),
  character: session.character,
  resources: {
    life: { value: 100, max: 100, updatedAt: iso(0) },
    vigor: { value: 80, max: 100, updatedAt: iso(0) },
    toil: { value: 50, max: 50, updatedAt: iso(0) },
    sanity: { value: 100, max: 100, updatedAt: iso(0) },
  },
  wallet: { silver: 42 },
  activities: [
    {
      id: '01a188cb-f59f-78dd-8fc3-9645f06cab84',
      type: 'mission',
      defId: 'trial.wreck-search',
      status: 'completed',
      startAt: iso(-6 * 60_000),
      endAt: iso(-60_000),
      result: { experience: 36, silver: 3, outcome: 'Wrak milczy.' },
    },
  ],
};

function renderHome() {
  return renderWithProviders(
    <Routes>
      <Route
        element={
          <>
            <TopBar session={session} />
            <Outlet context={session} />
          </>
        }
      >
        <Route index element={<HomeScreen />} />
      </Route>
    </Routes>,
  );
}

describe('Dom i pasek gracza', () => {
  it('pokazuje zasoby, Srebro, następny krok i nagrodę do odbioru', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(dashboard));
    renderHome();

    await waitFor(() => {
      expect(screen.getByTestId('wallet-silver')).toHaveTextContent('42');
    });
    const vigor = screen.getByTestId('resource-vigor');
    expect(vigor).toHaveTextContent('80');
    expect(vigor).toHaveAccessibleName('Wigor: 80/100, pełne za 40 min');

    await userEvent.click(vigor);
    expect(screen.getByRole('status')).toHaveTextContent('pełne za 40 min');

    expect(screen.getByTestId('next-step')).toHaveTextContent('Nagrody czekają');
    const ready = screen.getByRole('region', { name: 'Gotowe do odbioru' });
    expect(within(ready).getByText('Wrak milczy.')).toBeInTheDocument();
    expect(within(ready).getByText('+36 PD · +3 srebra')).toBeInTheDocument();
  });

  it('odbiór nagrody wysyła intencję z kluczem idempotencji', async () => {
    const urlOf = (input: string | URL | Request) =>
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
      Promise.resolve(
        urlOf(input).endsWith('/claim')
          ? jsonResponse({
              claimed: [],
              character: session.character,
              wallet: { silver: 45 },
              resources: dashboard.resources,
            })
          : jsonResponse(dashboard),
      ),
    );
    renderHome();

    await userEvent.click(await screen.findByRole('button', { name: 'Odbierz' }));
    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([input]) => urlOf(input).endsWith('/claim'))).toBe(true);
    });
    const [input, init] = fetchSpy.mock.calls.find(([candidate]) =>
      urlOf(candidate).endsWith('/claim'),
    )!;
    expect(urlOf(input)).toBe(`/api/v1/activities/${dashboard.activities[0]!.id}/claim`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)[IDEMPOTENCY_HEADER]).toMatch(/^[\w-]{36}$/);
  });
});
