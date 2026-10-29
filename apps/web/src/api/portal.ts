import { API_PREFIX } from '@game/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { dashboardQueryKey, newIdempotencyKey } from './game';
import { apiRequest } from './client';

const portalSchema = z.object({
  keys: z.object({
    regen: z.number(),
    loot: z.number(),
    shards: z.number(),
    total: z.number(),
    fullAt: z.string().nullable(),
  }),
  next: z.object({
    domain: z.number(),
    stage: z.number(),
    substage: z.number(),
    name: z.string(),
    place: z.string(),
    modifier: z.string(),
    recommendedLevel: z.number(),
    open: z.boolean(),
  }),
  well: z.object({
    floor: z.number(),
    max: z.number(),
    whisperPending: z.boolean(),
  }),
  candles: z.number(),
});

const fightSchema = z.object({
  result: z.object({ winner: z.enum(['player', 'enemy']), rounds: z.number() }),
  firstClear: z.boolean(),
  experience: z.number(),
  shardsGained: z.number(),
});

export function usePortal() {
  return useQuery({
    queryKey: ['portal'],
    queryFn: ({ signal }) => apiRequest(`${API_PREFIX}/portal`, { schema: portalSchema, signal }),
  });
}

export function usePortalFight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { domain: number; stage: number; substage: number }) =>
      apiRequest(`${API_PREFIX}/portal/fight`, {
        method: 'POST',
        body,
        idempotencyKey: newIdempotencyKey(),
        schema: fightSchema,
      }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portal'] }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ]),
  });
}
