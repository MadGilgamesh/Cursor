import { API_PREFIX } from '@game/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from './client';

const hallSchema = z.object({
  hall: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      level: z.number(),
      members: z.number(),
      seats: z.number(),
      recruitment: z.boolean(),
    }),
  ),
  lodgeId: z.uuid().nullable(),
});

const awakeningSchema = z.object({
  week: z.string(),
  domain: z.number(),
  domainName: z.string(),
  level: z.number(),
  receipts: z.number(),
});

export function useHall() {
  return useQuery({
    queryKey: ['lodges'],
    queryFn: ({ signal }) => apiRequest(`${API_PREFIX}/lodges`, { schema: hallSchema, signal }),
  });
}

export function useAwakening() {
  return useQuery({
    queryKey: ['awakening'],
    queryFn: ({ signal }) =>
      apiRequest(`${API_PREFIX}/awakening`, { schema: awakeningSchema, signal }),
  });
}
