import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from '../src/middleware.js';
import { getExperiment, CHECKOUT_FLOW_EXPERIMENT_KEY } from '@/lib/experiments.config';
import { configVersion } from '@/lib/experiment-version';
import { STICKY_COOKIE_PREFIX, UID_COOKIE } from '@/lib/constants';

const checkoutConfig = getExperiment(CHECKOUT_FLOW_EXPERIMENT_KEY)!;
const CURRENT_VERSION = configVersion(checkoutConfig);

function requestTo(pathname: string, cookieHeader?: string): NextRequest {
  return new NextRequest(new URL(`https://example.com${pathname}`), {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

describe('middleware redirect decision (checkout-flow-v2)', () => {
  it('redirects a variant-assigned user from /checkout to /checkout-v2', () => {
    const cookie = `${UID_COOKIE}=user-1; ${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=variant:${CURRENT_VERSION}`;
    const response = middleware(requestTo('/checkout', cookie));

    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location!).pathname).toBe('/checkout-v2');
  });

  it('redirects a control-assigned user from /checkout-v2 back to /checkout', () => {
    const cookie = `${UID_COOKIE}=user-2; ${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=control:${CURRENT_VERSION}`;
    const response = middleware(requestTo('/checkout-v2', cookie));

    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location!).pathname).toBe('/checkout');
  });

  it('passes through (no redirect) for a control-assigned user already on /checkout', () => {
    const cookie = `${UID_COOKIE}=user-3; ${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=control:${CURRENT_VERSION}`;
    const response = middleware(requestTo('/checkout', cookie));

    expect(response.headers.get('location')).toBeNull();
  });

  it('passes through (no redirect) for a variant-assigned user already on /checkout-v2', () => {
    const cookie = `${UID_COOKIE}=user-4; ${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=variant:${CURRENT_VERSION}`;
    const response = middleware(requestTo('/checkout-v2', cookie));

    expect(response.headers.get('location')).toBeNull();
  });

  it('ignores a sticky cookie from a stale config version and re-buckets fresh', () => {
    // Version "stale-version" will never match the live config's fingerprint,
    // so this should fall through to a fresh assign() call rather than
    // trusting the stored variant blindly.
    const cookie = `${UID_COOKIE}=user-5; ${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=variant:stale-version`;
    const response = middleware(requestTo('/checkout', cookie));

    // Whatever the outcome, a fresh sticky cookie for the *current* version
    // should now be set (proving it recomputed instead of trusting the
    // stale value).
    const setCookieHeader = response.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain(`${STICKY_COOKIE_PREFIX}${CHECKOUT_FLOW_EXPERIMENT_KEY}=`);
    expect(setCookieHeader).toContain(CURRENT_VERSION);
  });

  it('sets a new exp_uid cookie for a first-time visitor', () => {
    const response = middleware(requestTo('/checkout'));
    const setCookieHeader = response.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain(`${UID_COOKIE}=`);
  });

  it('does not touch unrelated routes (matcher scope)', () => {
    // /dashboard isn't in the middleware matcher config, but calling the
    // function directly still executes it — verify it simply no-ops (no
    // redirect, no experiment headers) since pathname matches neither
    // experiment's routes.
    const response = middleware(requestTo('/dashboard'));
    expect(response.headers.get('location')).toBeNull();
  });
});
