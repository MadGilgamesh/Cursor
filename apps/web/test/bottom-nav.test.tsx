import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BottomNav } from '../src/layout/BottomNav';
import { renderWithProviders } from './render';

describe('BottomNav', () => {
  it('pokazuje pięć zakładek z GDD w ustalonej kolejności', () => {
    renderWithProviders(<BottomNav />);
    const nav = screen.getByRole('navigation', { name: 'Nawigacja główna' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Dom',
      'Miasto',
      'Mrok',
      'Postać',
      'Wspólnota',
    ]);
  });

  it('oznacza aktywną zakładkę', () => {
    renderWithProviders(<BottomNav />, { route: '/postac' });
    expect(screen.getByRole('link', { name: 'Postać' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dom' })).not.toHaveAttribute('aria-current');
  });
});
