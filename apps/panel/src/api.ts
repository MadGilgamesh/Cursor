import { loadContentPack, packDocument, type ContentPack } from '@game/content';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    let message = 'Żądanie nie powiodło się';
    if (body && typeof body === 'object' && 'error' in body) {
      const error = body.error;
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
      ) {
        message = error.message;
      }
    }
    throw new ApiError(message, response.status);
  }
  return body as T;
}

const publicationSchema = z.object({
  revision: z.int().positive(),
  label: z.string(),
  publishedAt: z.string(),
  current: z.boolean(),
});

export interface ContentResponse {
  draft: ContentPack;
  currentRevision: number | null;
  publications: z.infer<typeof publicationSchema>[];
}

export function parseContentResponse(input: unknown): ContentResponse {
  const parsed = z
    .object({
      draft: z.unknown(),
      currentRevision: z.int().positive().nullable(),
      publications: z.array(publicationSchema),
    })
    .parse(input);
  return { ...parsed, draft: packDocument(loadContentPack(parsed.draft)) };
}
