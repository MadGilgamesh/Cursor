import { API_PREFIX } from '@game/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from './client';

const viewSchema = z.object({
  pace: z.string(),
  day: z.number(),
  days: z.number(),
  clockBp: z.number(),
  finale: z.string(),
  thresholds: z.array(z.number()),
  deadNight: z.boolean(),
  patron: z.boolean(),
  domain: z.string(),
  ranking: z.array(z.object({ name: z.string(), pl: z.number() })),
});

export function useConjunction() {
  return useQuery({
    queryKey: ['conjunction'],
    queryFn: ({ signal }) =>
      apiRequest(`${API_PREFIX}/conjunction`, { schema: viewSchema, signal }),
  });
}
