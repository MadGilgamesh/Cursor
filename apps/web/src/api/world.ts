import { API_PREFIX, CITIES } from '@game/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from './client';
import { dashboardQueryKey, newIdempotencyKey } from './game';

const plotSchema = z.object({
  index: z.number(),
  cropId: z.string().nullable(),
  plantedAt: z.number().nullable(),
  wateredAt: z.number().nullable(),
  phase: z.string(),
});

export const worldViewSchema = z.object({
  city: z.enum(CITIES),
  cityName: z.string(),
  traveling: z.boolean(),
  travelTo: z.string().nullable(),
  arrivesAt: z.string().nullable(),
  weather: z.string(),
  wolfHour: z.boolean(),
  tide: z.enum(['low', 'high']),
  contamination: z.number(),
  plots: z.array(plotSchema),
  residents: z.array(
    z.object({
      city: z.string(),
      id: z.string(),
      familiarity: z.number(),
      gone: z.boolean(),
    }),
  ),
  cityReputation: z.record(z.string(), z.number()),
});

export type WorldView = z.infer<typeof worldViewSchema>;

export const worldQueryKey = ['world'] as const;

export function useWorld() {
  return useQuery({
    queryKey: worldQueryKey,
    queryFn: ({ signal }) => apiRequest(`${API_PREFIX}/world`, { schema: worldViewSchema, signal }),
  });
}

export function useTravel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (city: string) =>
      apiRequest(`${API_PREFIX}/travel`, {
        method: 'POST',
        body: { city },
        idempotencyKey: newIdempotencyKey(),
        schema: z.object({ arrivesAt: z.string().nullable(), ambush: z.boolean() }),
      }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: worldQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ]),
  });
}

export function useMeetResident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (residentId: string) =>
      apiRequest(`${API_PREFIX}/residents/meet`, {
        method: 'POST',
        body: { residentId },
        idempotencyKey: newIdempotencyKey(),
        schema: z.object({
          residentId: z.string(),
          familiarity: z.number(),
          reputation: z.number(),
        }),
      }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: worldQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ]),
  });
}
