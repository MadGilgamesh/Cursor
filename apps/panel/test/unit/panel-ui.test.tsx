import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { ContentTable } from '../../src/content-table.js';
import { EventForm } from '../../src/event-form.js';
import { navFor } from '../../src/nav.js';
import { LoginPage } from '../../src/pages.js';
import type { GameEvent } from '@game/content';

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const event: GameEvent = {
  id: 'event.noc-zmarlych',
  name: 'Noc Zmarłych',
  description: 'Święto, które morze obchodzi bez nas.',
  startsAt: '2099-01-01T00:00:00.000Z',
  endsAt: '2099-01-02T00:00:00.000Z',
  timezone: 'UTC',
  enabled: true,
  rewards: [{ kind: 'currency', currency: 'silver', amount: 25 }],
  modifiers: [{ id: 'groza', target: 'Groza', operation: 'add', value: 1 }],
};

describe('nawigacja ról', () => {
  it('projektant widzi treść, a nie graczy', () => {
    expect(navFor('content_designer').map((item) => item.label)).toEqual([
      'Treść',
      'Eventy',
      'Publikacje',
    ]);
    expect(navFor('moderator').map((item) => item.label)).toEqual([
      'Gracze',
      'Audyt',
      'Ogłoszenia',
    ]);
    expect(navFor('administrator').map((item) => item.label)).toContain('Treść');
  });
});

describe('lista treści', () => {
  it('pokazuje nazwę z bestiariusza', () => {
    wrap(
      <ContentTable
        rows={[{ id: 'enemy.canal-rat', name: 'Szczur z Kanału', detail: 'Krąg 9' }]}
        hrefFor={(id) => `/tresc/bestiariusz/${id}`}
      />,
    );
    expect(screen.getByRole('link', { name: 'Szczur z Kanału' })).toBeVisible();
  });
});

describe('edytor eventu', () => {
  it('pokazuje podgląd przed publikacją w strefie UTC', () => {
    wrap(<EventForm value={event} onChange={() => undefined} onSubmit={() => undefined} />);
    const preview = screen.getByTestId('event-preview');
    expect(preview).toHaveTextContent('Podgląd przed publikacją');
    expect(preview).toHaveTextContent('Przed startem');
    expect(preview).toHaveTextContent('UTC');
    expect(preview).toHaveTextContent('25 srebra');
    expect(screen.getByRole('button', { name: 'Zapisz w szkicu' })).toBeEnabled();
  });
});

describe('logowanie', () => {
  it('mówi, że wejście jest tylko dla personelu', () => {
    wrap(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'Kancelaria' })).toBeVisible();
    expect(screen.getByText(/tylko dla personelu/)).toBeVisible();
  });
});
