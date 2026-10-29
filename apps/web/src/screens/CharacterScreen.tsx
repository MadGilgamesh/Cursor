import { useNavigate } from 'react-router';

import { useLogout } from '../api/auth';
import { useCurrentPlayer } from '../layout/current-player';
import { Button } from '../ui/Button';
import { XpBar } from '../ui/XpBar';

export function CharacterScreen() {
  const { account, character } = useCurrentPlayer();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold tracking-wide text-bone-50">Postać</h1>

      <section className="panel p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-2xl font-semibold text-bone-50">{character.name}</p>
          <p className="font-display text-lg text-brass-300">Poziom {character.level}</p>
        </div>
        <p className="mb-3 text-xs text-bone-400">Przebudzony z Zakonu Latarników</p>
        <XpBar character={character} />
        <p className="mt-3 text-sm text-bone-600 italic">
          Statystyki, ekwipunek i Echa pojawią się w kolejnych etapach.
        </p>
      </section>

      <section className="panel space-y-1 p-4">
        <p className="text-xs tracking-widest text-bone-400 uppercase">Konto</p>
        <p className="text-sm text-bone-200">
          Przebudzenie: {new Date(account.createdAt).toLocaleDateString('pl-PL')}
        </p>
      </section>

      <Button
        variant="ghost"
        disabled={logout.isPending}
        onClick={() => {
          logout.mutate(undefined, {
            onSettled: () => void navigate('/logowanie', { replace: true }),
          });
        }}
      >
        Wyloguj
      </Button>
    </div>
  );
}
