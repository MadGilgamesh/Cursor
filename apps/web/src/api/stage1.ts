import { API_PREFIX } from '@game/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { dashboardQueryKey, newIdempotencyKey } from './game';
import { apiRequest } from './client';

const profileSchema = z.object({
  stats: z.object({
    strength: z.number(),
    defense: z.number(),
    accuracy: z.number(),
    evasion: z.number(),
  }),
  classId: z.string().nullable(),
  classLevel: z.number(),
  circle: z.number(),
  hall: z.number(),
  status: z.string(),
  tutorialDone: z.boolean(),
});

const huntSchema = z.object({
  circle: z.number(),
  targets: z.array(
    z.object({
      index: z.number(),
      enemyId: z.string(),
      name: z.string(),
      named: z.boolean(),
      floor: z.number(),
    }),
  ),
});

const inventorySchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      defId: z.string(),
      name: z.string(),
      quantity: z.number(),
      equippedSlot: z.string().nullable(),
    }),
  ),
});

const fightSchema = z.object({
  result: z.object({ winner: z.enum(['player', 'enemy']), rounds: z.number() }),
});

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => apiRequest(`${API_PREFIX}/profile`, { schema: profileSchema, signal }),
  });
}

export function useHunts() {
  return useQuery({
    queryKey: ['hunts'],
    queryFn: ({ signal }) => apiRequest(`${API_PREFIX}/hunts`, { schema: huntSchema, signal }),
  });
}

export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: ({ signal }) =>
      apiRequest(`${API_PREFIX}/inventory`, { schema: inventorySchema, signal }),
  });
}

function useAct(path: string, schema?: z.ZodType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: object) =>
      apiRequest(path, {
        method: 'POST',
        body,
        idempotencyKey: newIdempotencyKey(),
        ...(schema ? { schema } : {}),
      }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['hunts'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ]),
  });
}

export const useTutorial = () => useAct(`${API_PREFIX}/tutorial`, fightSchema);
export const useFight = () => useAct(`${API_PREFIX}/hunts/fight`, fightSchema);
export const useBuy = () => useAct(`${API_PREFIX}/shop/buy`);
export const useEquip = () => useAct(`${API_PREFIX}/inventory/equip`);
export const useTrain = () => useAct(`${API_PREFIX}/training`);
