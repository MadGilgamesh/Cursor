import {
  API_PREFIX,
  sessionResponseSchema,
  type LoginRequest,
  type RegisterRequest,
  type SessionResponse,
} from '@game/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, ApiRequestError } from './client';

export const sessionQueryKey = ['session'] as const;

/** Konto i postać zalogowanego gracza; `null` oznacza brak sesji. */
export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: async ({ signal }): Promise<SessionResponse | null> => {
      try {
        return await apiRequest(`${API_PREFIX}/me`, { schema: sessionResponseSchema, signal });
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 30_000,
    retry: false,
  });
}

function useAuthMutation<TInput>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      apiRequest(`${API_PREFIX}/auth/${path}`, {
        method: 'POST',
        body: input,
        schema: sessionResponseSchema,
      }),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueryKey, session);
    },
  });
}

export const useLogin = () => useAuthMutation<LoginRequest>('login');
export const useRegister = () => useAuthMutation<RegisterRequest>('register');

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest(`${API_PREFIX}/auth/logout`, { method: 'POST' }),
    onSettled: () => {
      queryClient.setQueryData(sessionQueryKey, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionQueryKey[0] });
    },
  });
}
