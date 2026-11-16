// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ApiError, fetchJson } from './client';

describe('api/client', () => {
  it('parses JSON on 2xx response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hello: 'world' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchJson<{ hello: string }>('/api/test');
    expect(res).toEqual({ hello: 'world' });
    vi.unstubAllGlobals();
  });

  it('throws ApiError with detail message on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Tag not found' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchJson('/api/tags/999')).rejects.toThrowError(ApiError);
    await expect(fetchJson('/api/tags/999')).rejects.toThrowError('Tag not found');
    vi.unstubAllGlobals();
  });
});
