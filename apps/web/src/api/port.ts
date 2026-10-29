import { API_PREFIX } from '@game/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from './client';

const portSchema = z.object({
  goods: z.record(z.string(), z.number()),
  levels: z.record(z.string(), z.number()),
  jobs: z.array(z.object({ station: z.string(), goodId: z.string(), endsAt: z.string() })),
  candleReady: z.boolean(),
  mail: z.number(),
});

export function usePort() {
  return useQuery({
    queryKey: ['port'],
    queryFn: ({ signal }) => apiRequest(`${API_PREFIX}/port`, { schema: portSchema, signal }),
  });
}
