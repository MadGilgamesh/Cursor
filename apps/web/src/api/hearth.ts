import { API_PREFIX } from '@game/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from './client';

const houseSchema = z.object({
  id: z.string(),
  name: z.string(),
  built: z.boolean(),
  arrears: z.boolean(),
  rooms: z.record(z.string(), z.number()),
  roomCap: z.number(),
  upkeep: z.number(),
});

const oathSchema = z.object({
  id: z.string(),
  name: z.string(),
  aspect: z.string(),
  circle: z.number(),
  wrath: z.boolean(),
});

const cultSchema = z.object({
  sleeper: z.string(),
  rank: z.string(),
  suspicion: z.number(),
  unmasked: z.boolean(),
});

const hearthSchema = z.object({
  house: houseSchema.nullable(),
  oath: oathSchema.nullable(),
  cult: cultSchema.nullable(),
  contamination: z.number(),
  mutations: z.array(z.string()),
  offer: z.array(z.string()),
  hideout: z.boolean(),
  hideoutLooted: z.boolean(),
  wounds: z.number(),
  candles: z.number(),
  vigorBonusBp: z.number(),
  saltThreshold: z.boolean(),
});

export function useHearth() {
  return useQuery({
    queryKey: ['hearth'],
    queryFn: ({ signal }) => apiRequest(`${API_PREFIX}/hearth`, { schema: hearthSchema, signal }),
  });
}
