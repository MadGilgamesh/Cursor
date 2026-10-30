import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HearthScreen } from '../src/screens/HearthScreen';
import { jsonResponse, renderWithProviders } from './render';

const hearth = {
  house: null,
  oath: null,
  cult: null,
  contamination: 0,
  mutations: [],
  offer: [],
  hideout: false,
  hideoutLooted: false,
  wounds: 0,
  candles: 0,
  vigorBonusBp: 500,
  sanityBonusBp: 2_000,
  saltThreshold: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Próg domu', () => {
  it('pokazuje te same procenty, które skraca tik regeneracji', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(hearth));
    renderWithProviders(<HearthScreen />);

    expect(await screen.findByText('Sypialnia: +5% regeneracji Wigoru.')).toBeInTheDocument();
    expect(screen.getByText('Kaplica Domowa: +20% regeneracji Poczytalności.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('hearth')).toBeInTheDocument();
    });
  });
});
