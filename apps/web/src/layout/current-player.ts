import type { SessionResponse } from '@game/shared';
import { useOutletContext } from 'react-router';

/** Konto i postać zalogowanego gracza dla ekranów wewnątrz powłoki aplikacji (`AppShell`). */
export const useCurrentPlayer = () => useOutletContext<SessionResponse>();
