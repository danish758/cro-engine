import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CroEngineClient } from '../src/client.js';
import type { ExperimentConfig } from '@cro-engine/assignment-engine';

const RUNNING_EXPERIMENT: ExperimentConfig = {
  key: 'homepage-cta',
  status: 'running',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'variant', weight: 50 },
  ],
};

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  });
}

describe('CroEngineClient', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches config once and reuses the cache within the TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ experiments: [RUNNING_EXPERIMENT] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example', cacheTtlMs: 60_000 });

    await client.assign('homepage-cta', { userId: 'user-1' });
    await client.assign('homepage-cta', { userId: 'user-2' });
    await client.assign('homepage-cta', { userId: 'user-3' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://platform.example/api/v1/config',
      expect.objectContaining({ headers: { Authorization: 'Bearer sk_test' } })
    );
  });

  it('getConfig() returns the raw config, using the same cache as assign()', async () => {
    const fetchMock = mockFetchOnce({ experiments: [RUNNING_EXPERIMENT] });
    vi.stubGlobal('fetch', fetchMock);
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    const config = await client.getConfig('homepage-cta');
    expect(config).toEqual(RUNNING_EXPERIMENT);
    expect(await client.getConfig('unknown-key')).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns excluded/invalid-config for an unknown experiment key', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ experiments: [RUNNING_EXPERIMENT] }));
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    const result = await client.assign('does-not-exist', { userId: 'user-1' });
    expect(result).toEqual({ status: 'excluded', reason: 'invalid-config' });
  });

  it('evaluates bucketing locally via assign() once config is cached', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ experiments: [RUNNING_EXPERIMENT] }));
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    const result = await client.assign('homepage-cta', { userId: 'user-1' });
    expect(result.status).toBe('assigned');
  });

  it('coalesces concurrent calls on a cold cache into a single fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ experiments: [RUNNING_EXPERIMENT] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    await Promise.all([
      client.assign('homepage-cta', { userId: 'user-1' }),
      client.assign('homepage-cta', { userId: 'user-2' }),
      client.assign('homepage-cta', { userId: 'user-3' }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves a stale cache instead of throwing when a refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ experiments: [RUNNING_EXPERIMENT] }) })
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example', cacheTtlMs: 0 });

    const first = await client.assign('homepage-cta', { userId: 'user-1' });
    expect(first.status).toBe('assigned');

    // cacheTtlMs: 0 means the second call sees the cache as stale and
    // attempts a refetch, which is mocked to reject — should fall back to
    // the already-cached config rather than throwing.
    const second = await client.assign('homepage-cta', { userId: 'user-1' });
    expect(second.status).toBe('assigned');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on a cold cache with no fallback when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    await expect(client.assign('homepage-cta', { userId: 'user-1' })).rejects.toThrow();
  });
});

describe('CroEngineClient forcing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the forced variant directly, without computing a real bucket', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ experiments: [RUNNING_EXPERIMENT] }));
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    const result = await client.assign('homepage-cta', { userId: 'user-1' }, { forceVariant: 'variant' });
    expect(result).toEqual({ status: 'assigned', variantKey: 'variant', bucket: -1 });
  });

  it('forcing bypasses a draft (not-running) experiment status', async () => {
    const draftExperiment: ExperimentConfig = { ...RUNNING_EXPERIMENT, status: 'draft' };
    vi.stubGlobal('fetch', mockFetchOnce({ experiments: [draftExperiment] }));
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    // Without forcing, a draft experiment always excludes.
    const unforced = await client.assign('homepage-cta', { userId: 'user-1' });
    expect(unforced.status).toBe('excluded');

    const forced = await client.assign('homepage-cta', { userId: 'user-1' }, { forceVariant: 'variant' });
    expect(forced).toEqual({ status: 'assigned', variantKey: 'variant', bucket: -1 });
  });

  it('forcing bypasses a targeting rule that would otherwise exclude everyone', async () => {
    const targetedExperiment: ExperimentConfig = {
      ...RUNNING_EXPERIMENT,
      targeting: [{ attribute: 'device', operator: 'eq', value: 'mobile' }],
    };
    vi.stubGlobal('fetch', mockFetchOnce({ experiments: [targetedExperiment] }));
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    // No attributes passed — fails closed without forcing.
    const unforced = await client.assign('homepage-cta', { userId: 'user-1' });
    expect(unforced.status).toBe('excluded');

    const forced = await client.assign('homepage-cta', { userId: 'user-1' }, { forceVariant: 'control' });
    expect(forced).toEqual({ status: 'assigned', variantKey: 'control', bucket: -1 });
  });

  it('falls back to normal assignment when forceVariant names an unknown variant', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ experiments: [RUNNING_EXPERIMENT] }));
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    const result = await client.assign('homepage-cta', { userId: 'user-1' }, { forceVariant: 'not-a-real-variant' });
    expect(result.status).toBe('assigned');
    if (result.status === 'assigned') {
      expect(result.bucket).not.toBe(-1); // a real computed bucket, not the forced sentinel
    }
  });
});

describe('CroEngineClient tracking + flush', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends queued exposures and conversions as one POST on flush', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    client.trackExposure('user-1', 'homepage-cta', 'control');
    client.trackConversion('user-1', 'purchase_completed', 49);
    await client.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://platform.example/api/v1/events');
    expect(JSON.parse(init.body as string)).toEqual({
      exposures: [{ userId: 'user-1', experimentKey: 'homepage-cta', variantKey: 'control' }],
      conversions: [{ userId: 'user-1', eventName: 'purchase_completed', value: 49 }],
    });
  });

  it('does not call fetch when nothing is queued', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    await client.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the queue after flushing, so a second flush is a no-op', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    client.trackExposure('user-1', 'homepage-cta', 'control');
    await client.flush();
    await client.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the events POST fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const client = new CroEngineClient({ apiKey: 'sk_test', apiUrl: 'https://platform.example' });

    client.trackExposure('user-1', 'homepage-cta', 'control');
    await expect(client.flush()).resolves.toBeUndefined();
  });
});
