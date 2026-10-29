import { API_PREFIX } from '@game/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiRequest } from './client';
import { dashboardQueryKey, newIdempotencyKey } from './game';

const clueSchema = z.object({
  id: z.string(),
  source: z.string(),
  question: z.string(),
  found: z.boolean(),
  supports: z.number().optional(),
});

const loreSchema = z.object({
  knowledge: z.number(),
  madnessUi: z.boolean(),
  residents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      familiarity: z.number(),
      gone: z.boolean(),
    }),
  ),
  case: z
    .object({
      questions: z.array(
        z.object({ id: z.string(), prompt: z.string(), options: z.array(z.string()) }),
      ),
      clues: z.array(clueSchema),
    })
    .nullable(),
  chapel: z.object({ composure: z.number(), insight: z.number(), stealth: z.number() }),
  college: z.object({
    courseId: z.string().nullable(),
    endsAt: z.string().nullable(),
    done: z.array(z.string()),
  }),
  scars: z.array(z.string()),
  booksRead: z.array(z.string()),
  bestiaryPages: z.number(),
  constellation: z.object({
    nodes: z.array(z.string()),
    points: z.number(),
    extinctOpen: z.boolean(),
  }),
  factions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      reputation: z.number(),
      rank: z.number(),
      seals: z.number(),
    }),
  ),
});

export type LoreView = z.infer<typeof loreSchema>;

export function useLore() {
  return useQuery({
    queryKey: ['lore'],
    queryFn: ({ signal }) => apiRequest(`${API_PREFIX}/lore`, { schema: loreSchema, signal }),
  });
}

function useLoreMutation<T>(path: string, schema: z.ZodType<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      apiRequest(`${API_PREFIX}${path}`, {
        method: 'POST',
        body,
        idempotencyKey: newIdempotencyKey(),
        schema,
      }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lore'] }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ]),
  });
}

const caseResponse = z.object({
  case: loreSchema.shape.case,
  revealed: z.boolean().optional(),
  expired: z.boolean().optional(),
});

export const useOpenCase = () => useLoreMutation('/investigations/open', caseResponse);
export const useTakeClue = () => useLoreMutation('/investigations/clue', caseResponse);
export const useTrainChapel = () =>
  useLoreMutation(
    '/chapel/train',
    z.object({ composure: z.number(), insight: z.number(), stealth: z.number() }),
  );
export const useSetMadness = () =>
  useLoreMutation('/lore/madness', z.object({ madnessUi: z.boolean() }));
