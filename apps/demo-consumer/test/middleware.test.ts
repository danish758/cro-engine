import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssignmentResult, ExperimentConfig } from '@cro-engine/assignment-engine';
import { STICKY_COOKIE_PREFIX, UID_COOKIE } from '@/lib/constants';
import { configVersion } from '@/lib/experiment-version';
import {
  CHECKOUT_FLOW_EXPERIMENT_KEY,
  PRICING_CTA_COLOR_EXPERIMENT_KEY,
  PRICING_CTA_EXPERIMENT_KEY,
} from '@/lib/experiments.config';

const CHECKOUT_CONFIG: ExperimentConfig = {
  key: CHECKOUT_FLOW_EXPERIMENT_KEY,
  status: 'running',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'variant', weight: 50 },
  ],
};
const CURRENT_VERSION = configVersion(CHECKOUT_CONFIG);

const getConfigMock = vi.fn(async (_key: string): Promise<ExperimentConfig | undefined> => CHECKOUT_CONFIG);
const assignMock = vi.fn(
  async (_key: string, _ctx: unknown): Promise<AssignmentResult> => ({
    status: 'assigned',
    variantKey: 'variant',
    bucket: 1234,
  })
);

// The SDK does real network I/O — middleware tests mock its exported
// singleton client directly (a smaller, more stable seam than stubbing
// global fetch and reaching into the SDK's internal cache/request shape).
vi.mock('@/lib/cro-engine', () => ({
  croEngine: {
    getConfig: (...args: Parameters<typeof getConfigMock>) => getConfigMock(...args),
    assign: (...args: Parameters<typeof assignMock>) => assignMock(...args),
  },
}));

function requestTo(pathAndSearch: string, cookieHeader?: string): NextRequest {
  return new NextRequest(new URL(`https://example.com${pathAndSearch}`), {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

describe('demo-consumer middleware (SDK-backed)', () => {
  beforeEach(() => {
    getConfigMock.mockReset();
    assignMock.mockReset();
    // Default implementation every test starts from — individual tests that
    // need different config/assignment behavior override it locally and
    // don't need to restore it themselves, since this runs again before the
    // next test regardless of whether the previous one passed or threw.
    getConfigMock.mockImplementation(async (_key: string) => CHECKOUT_CONFIG);
    assignMock.mockImplementation(async (_key: string, _ctx: unknown) => ({
      status: 'assigned',
      variantKey: 'variant',
      bucket: 1234,
    }));
  });

  it('redirects a variant-assigned (sticky) user from /checkout to /checkout-v2', async () => {
    const { middleware } = await import('@/middleware');
    const cookie = `${UID_COOKIE}=user-1; ${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=variant:${CURRENT_VERSION}`;

    const response = await middleware(requestTo('/checkout', cookie));

    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location!).pathname).toBe('/checkout-v2');
    // Sticky cookie was valid, so this should reuse it rather than calling
    // the SDK's assign() again — only getConfig() (for the version check)
    // should have been called.
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('redirects a control-assigned (sticky) user from /checkout-v2 back to /checkout', async () => {
    const { middleware } = await import('@/middleware');
    const cookie = `${UID_COOKIE}=user-2; ${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=control:${CURRENT_VERSION}`;

    const response = await middleware(requestTo('/checkout-v2', cookie));

    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location!).pathname).toBe('/checkout');
  });

  it('passes through for a control-assigned user already on /checkout', async () => {
    const { middleware } = await import('@/middleware');
    const cookie = `${UID_COOKIE}=user-3; ${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=control:${CURRENT_VERSION}`;

    const response = await middleware(requestTo('/checkout', cookie));
    expect(response.headers.get('location')).toBeNull();
  });

  it('calls the SDK\'s assign() when the sticky cookie is missing, and sets a fresh sticky cookie', async () => {
    const { middleware } = await import('@/middleware');
    const cookie = `${UID_COOKIE}=user-4`;

    const response = await middleware(requestTo('/checkout', cookie));

    expect(assignMock).toHaveBeenCalledTimes(1);
    const setCookieHeader = response.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain(`${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=`);
    expect(setCookieHeader).toContain(CURRENT_VERSION);
  });

  it('ignores a stale sticky cookie version and recomputes via assign()', async () => {
    const { middleware } = await import('@/middleware');
    const cookie = `${UID_COOKIE}=user-5; ${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=variant:stale-version`;

    await middleware(requestTo('/checkout', cookie));
    expect(assignMock).toHaveBeenCalledTimes(1);
  });

  it('sets a new exp_uid cookie for a first-time visitor', async () => {
    const { middleware } = await import('@/middleware');
    const response = await middleware(requestTo('/checkout'));
    const setCookieHeader = response.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain(`${UID_COOKIE}=`);
  });

  it('does not call the SDK at all for unrelated routes', async () => {
    const { middleware } = await import('@/middleware');
    const response = await middleware(requestTo('/some-other-page'));
    expect(response.headers.get('location')).toBeNull();
    expect(getConfigMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('resolves every experiment the ROUTE_EXPERIMENTS table lists for a route, not just one', async () => {
    // /pricing maps to two experiment keys — this is the declarative-table
    // refactor's whole point: a route can list more than one key and every
    // one of them gets bucketed + a sticky cookie + a forwarded header,
    // without any route-specific branching in middleware.ts itself.
    const configsByKey: Record<string, ExperimentConfig> = {
      [PRICING_CTA_EXPERIMENT_KEY]: {
        key: PRICING_CTA_EXPERIMENT_KEY,
        status: 'running',
        variants: [
          { key: 'control', weight: 50 },
          { key: 'variant', weight: 50 },
        ],
      },
      [PRICING_CTA_COLOR_EXPERIMENT_KEY]: {
        key: PRICING_CTA_COLOR_EXPERIMENT_KEY,
        status: 'running',
        variants: [
          { key: 'control', weight: 34 },
          { key: 'variant 1', weight: 33 },
          { key: 'variant 2', weight: 33 },
        ],
      },
    };
    getConfigMock.mockImplementation(async (key: string) => configsByKey[key]);
    assignMock.mockResolvedValueOnce({ status: 'assigned', variantKey: 'control', bucket: 1 });
    assignMock.mockResolvedValueOnce({ status: 'assigned', variantKey: 'variant 1', bucket: 2 });

    const { middleware } = await import('@/middleware');
    const response = await middleware(requestTo('/pricing', `${UID_COOKIE}=user-6`));

    expect(getConfigMock).toHaveBeenCalledWith(PRICING_CTA_EXPERIMENT_KEY);
    expect(getConfigMock).toHaveBeenCalledWith(PRICING_CTA_COLOR_EXPERIMENT_KEY);
    expect(assignMock).toHaveBeenCalledTimes(2);

    const setCookieHeader = response.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain(`${STICKY_COOKIE_PREFIX}${PRICING_CTA_EXPERIMENT_KEY}=`);
    expect(setCookieHeader).toContain(`${STICKY_COOKIE_PREFIX}${PRICING_CTA_COLOR_EXPERIMENT_KEY}=`);
  });

  it('passes request attributes (device) through to assign()', async () => {
    const { middleware } = await import('@/middleware');
    await middleware(requestTo('/checkout', `${UID_COOKIE}=user-7`));

    // No User-Agent header set on the test request, so device resolves to
    // 'desktop' (the fallback for an unrecognized/absent device type).
    expect(assignMock).toHaveBeenCalledWith(
      CHECKOUT_FLOW_EXPERIMENT_KEY,
      { userId: 'user-7', attributes: { device: 'desktop' } }
    );
  });

  it('includes the src query param in attributes when present', async () => {
    const { middleware } = await import('@/middleware');
    await middleware(requestTo('/checkout?src=newsletter', `${UID_COOKIE}=user-8`));

    expect(assignMock).toHaveBeenCalledWith(
      CHECKOUT_FLOW_EXPERIMENT_KEY,
      { userId: 'user-8', attributes: { device: 'desktop', src: 'newsletter' } }
    );
  });

  it('a valid cro_force_<key> param renders the forced variant without touching the sticky cookie', async () => {
    assignMock.mockImplementation(async (_key: string, _ctx: unknown, options?: { forceVariant?: string }) =>
      options?.forceVariant
        ? { status: 'assigned', variantKey: options.forceVariant, bucket: -1 }
        : { status: 'assigned', variantKey: 'variant', bucket: 1234 }
    );

    const { middleware } = await import('@/middleware');
    const response = await middleware(
      requestTo(`/checkout?cro_force_${CHECKOUT_FLOW_EXPERIMENT_KEY}=control`, `${UID_COOKIE}=user-9`)
    );

    // Forced to 'control' while requesting /checkout — canonical path
    // matches, so no redirect.
    expect(response.headers.get('location')).toBeNull();
    const setCookieHeader = response.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).not.toContain(STICKY_COOKIE_PREFIX);
    // Only the forced call — no fallback to normal assignment needed.
    expect(assignMock).toHaveBeenCalledTimes(1);
  });

  it('an unrecognized cro_force_<key> value falls back to normal assignment (and does set a sticky cookie)', async () => {
    assignMock.mockImplementation(async (_key: string, _ctx: unknown, options?: { forceVariant?: string }) =>
      // Simulates the SDK's own fallback: an invalid forceVariant never
      // produces the bucket: -1 sentinel, regardless of it being requested.
      ({ status: 'assigned', variantKey: 'variant', bucket: 1234 })
    );

    const { middleware } = await import('@/middleware');
    const response = await middleware(
      requestTo(`/checkout?cro_force_${CHECKOUT_FLOW_EXPERIMENT_KEY}=not-a-real-variant`, `${UID_COOKIE}=user-10`)
    );

    // Falls through to the normal path: one call with the (ignored) force
    // option, one more without it — and this time it's a real assignment,
    // so it DOES get a sticky cookie, unlike the genuinely-forced case above.
    expect(assignMock).toHaveBeenCalledTimes(2);
    const setCookieHeader = response.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain(`${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=`);
  });

  it('a forced variant header is marked so the page knows not to track it', async () => {
    assignMock.mockImplementation(async (_key: string, _ctx: unknown, options?: { forceVariant?: string }) =>
      options?.forceVariant
        ? { status: 'assigned', variantKey: options.forceVariant, bucket: -1 }
        : { status: 'assigned', variantKey: 'variant', bucket: 1234 }
    );

    const { middleware } = await import('@/middleware');
    const response = await middleware(
      requestTo(`/checkout?cro_force_${CHECKOUT_FLOW_EXPERIMENT_KEY}=control`, `${UID_COOKIE}=user-11`)
    );

    const forwardedHeaderValue = response.headers.get(`x-middleware-request-x-exp-${CHECKOUT_FLOW_EXPERIMENT_KEY}`);
    expect(forwardedHeaderValue).toBe('control|forced');
  });
});
