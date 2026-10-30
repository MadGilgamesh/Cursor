import { API_PREFIX } from '@game/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from './client';

const catalogSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number(),
  party: z.number(),
  hours: z.number(),
  window: z.string(),
  weekly: z.number(),
  open: z.boolean(),
  used: z.number(),
  remaining: z.number(),
});

const memberSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  assist: z.boolean(),
  ready: z.boolean(),
  classId: z.string().nullable(),
  share: z.number().nullable(),
});

const runSchema = z.object({
  id: z.string(),
  defId: z.string(),
  name: z.string(),
  status: z.string(),
  endsAt: z.string().nullable(),
  loot: z.number().nullable(),
  shared: z.number().nullable(),
  missed: z.number().nullable(),
  betrayerId: z.string().nullable(),
  log: z.array(z.string()),
  members: z.array(memberSchema),
});

const hallSchema = z.object({
  catalog: z.array(catalogSchema),
  mine: runSchema.nullable(),
});

export function useExpeditions() {
  return useQuery({
    queryKey: ['expeditions'],
    queryFn: ({ signal }) =>
      apiRequest(`${API_PREFIX}/expeditions`, { schema: hallSchema, signal }),
  });
}
