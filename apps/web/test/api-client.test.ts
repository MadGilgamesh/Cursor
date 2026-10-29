import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import { apiRequest, ApiRequestError } from '../src/api/client';
import { jsonResponse } from './render';

describe('apiRequest', () => {
  it('waliduje odpowiedź schematem', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ value: 42 }));
    await expect(
      apiRequest('/api/x', { schema: z.object({ value: z.number() }) }),
    ).resolves.toEqual({
      value: 42,
    });
  });

  it('zamienia błąd API na ApiRequestError z kodem', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Brak sesji' } }, 401),
    );
    const error = await apiRequest('/api/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED', message: 'Brak sesji' });
  });

  it('zgłasza czytelny błąd przy braku sieci', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('wysyła JSON z ciasteczkami tej samej domeny', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    await apiRequest('/api/x', { method: 'POST', body: { a: 1 } });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{"a":1}',
      }),
    );
  });
});
