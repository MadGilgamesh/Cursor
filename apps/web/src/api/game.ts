import {
  API_PREFIX,
  claimResponseSchema,
  dashboardResponseSchema,
  randomUuid,
  startActivityResponseSchema,
  type ClaimResponse,
  type DashboardResponse,
} from '@game/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { sessionQueryKey } from './auth';
import { apiRequest, retryNetworkErrors } from './client';

export const dashboardQueryKey = ['dashboard'] as const;

export interface DashboardData extends DashboardResponse {
  /** Różnica zegara serwera i urządzenia (ms) — klient nigdy nie ufa własnemu zegarowi. */
  clockOffsetMs: number;
}

export function useDashboard() {
  return useQuery({
    queryKey: dashboardQueryKey,
    queryFn: async ({ signal }): Promise<DashboardData> => {
      const sentAt = Date.now();
      const data = await apiRequest(`${API_PREFIX}/dashboard`, {
        schema: dashboardResponseSchema,
        signal,
      });
      const receivedAt = Date.now();
      // Czas serwera odpowiada mniej więcej środkowi podróży żądania.
      const clockOffsetMs = Date.parse(data.serverTime) - (sentAt + receivedAt) / 2;
      return { ...data, clockOffsetMs };
    },
    refetchInterval: 30_000,
  });
}

/** Bieżący czas serwera, odświeżany co `tickMs`. */
export function useServerNow(clockOffsetMs: number, tickMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now() + clockOffsetMs);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now() + clockOffsetMs);
    }, tickMs);
    return () => {
      clearInterval(timer);
    };
  }, [clockOffsetMs, tickMs]);
  return now;
}

function useGameAction<TInput>(
  request: (input: TInput & { idempotencyKey: string }) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    retry: retryNetworkErrors,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
        queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
      ]);
    },
  });
}

/** Każde dotknięcie przycisku to nowa intencja z własnym kluczem idempotencji. */
export const newIdempotencyKey = (): string => randomUuid();

export const useStartMission = () =>
  useGameAction<{ missionId: string; loop?: boolean }>(({ missionId, loop, idempotencyKey }) =>
    apiRequest(`${API_PREFIX}/activities`, {
      method: 'POST',
      body: { missionId, loop: loop ?? false },
      schema: startActivityResponseSchema,
      idempotencyKey,
    }),
  );

export const useClaimActivity = () =>
  useGameAction<{ activityId: string }>(({ activityId, idempotencyKey }): Promise<ClaimResponse> =>
    apiRequest(`${API_PREFIX}/activities/${activityId}/claim`, {
      method: 'POST',
      schema: claimResponseSchema,
      idempotencyKey,
    }),
  );

export const useClaimAll = () =>
  useGameAction<object>(({ idempotencyKey }): Promise<ClaimResponse> =>
    apiRequest(`${API_PREFIX}/activities/claim-all`, {
      method: 'POST',
      schema: claimResponseSchema,
      idempotencyKey,
    }),
  );
