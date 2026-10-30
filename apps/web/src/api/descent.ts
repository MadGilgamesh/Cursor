import { API_PREFIX } from '@game/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from './client';

const viewSchema = z.object({
  level: z.number(),
  descentCount: z.number(),
  max: z.number(),
  minLevel: z.number(),
  markTraining: z.number(),
  markMutation: z.number(),
  markConstellation: z.number(),
  essence: z.number(),
  essenceXp: z.number(),
  title: z.string().nullable(),
});

export function useDescent() {
  return useQuery({
    queryKey: ['descent'],
    queryFn: ({ signal }) => apiRequest(`${API_PREFIX}/descent`, { schema: viewSchema, signal }),
  });
}
