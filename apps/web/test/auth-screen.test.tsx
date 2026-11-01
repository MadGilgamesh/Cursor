import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuthScreen } from '../src/screens/AuthScreen';
import { jsonResponse, renderWithProviders } from './render';

describe('AuthScreen', () => {
  it('waliduje formularz rejestracji lokalnie, bez wywołania API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderWithProviders(<AuthScreen mode="register" />);

    await userEvent.type(screen.getByLabelText('E-mail'), 'nie-email');
    await userEvent.type(screen.getByLabelText('Imię postaci'), 'a');
    await userEvent.type(screen.getByLabelText('Hasło'), 'krótkie');
    await userEvent.click(screen.getByRole('button', { name: 'Przebudź się' }));

    expect(screen.getByText('Podaj poprawny adres e-mail')).toBeInTheDocument();
    expect(screen.getByText('Imię postaci musi mieć co najmniej 3 znaki')).toBeInTheDocument();
    expect(screen.getByText('Hasło musi mieć co najmniej 10 znaków')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('pokazuje komunikat błędu zwrócony przez serwer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Nieprawidłowy e-mail lub hasło' } },
        401,
      ),
    );
    renderWithProviders(<AuthScreen mode="login" />);

    await userEvent.type(screen.getByLabelText('E-mail lub login'), 'latarnik@sol.pl');
    await userEvent.type(screen.getByLabelText('Hasło'), 'złe-hasło');
    await userEvent.click(screen.getByRole('button', { name: 'Wejdź' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nieprawidłowy e-mail lub hasło');
  });
});
