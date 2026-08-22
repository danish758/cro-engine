import { NextResponse, type NextRequest } from 'next/server';
import { assign, type ExperimentConfig } from '@cro-engine/assignment-engine';
import { STICKY_COOKIE_PREFIX, UID_COOKIE, VARIANT_HEADER_PREFIX } from '@/lib/constants';
import {
  CHECKOUT_FLOW_EXPERIMENT_KEY,
  PRICING_CTA_EXPERIMENT_KEY,
  getExperiment,
} from '@/lib/experiments.config';
import { configVersion } from '@/lib/experiment-version';

// Only run on routes that actually participate in an experiment — assigning
// (or even loading config for) every experiment on every request, including
// ones unrelated to the current route, wastes edge CPU for no benefit.
export const config = {
  matcher: ['/checkout', '/checkout-v2', '/pricing'],
};

// Canonical path per variant for the redirect-type experiment. Whichever
// path doesn't match the assigned variant gets redirected to the one that
// does — this makes the redirect symmetric: a control user who lands
// directly on /checkout-v2 is sent back to /checkout, not just the reverse.
const CHECKOUT_PATH_BY_VARIANT: Record<string, string> = {
  control: '/checkout',
  variant: '/checkout-v2',
};

type Resolution = { variantKey: string; version: string; isFresh: boolean } | null;

/**
 * Resolves a user's variant for one experiment, honoring sticky assignment:
 * if a valid (version-matching) sticky cookie already exists, its variant is
 * reused as-is rather than recomputed — a user who already has a stored
 * assignment for this experiment key + config version is never
 * re-randomized. Status is still re-checked on every request (an experiment
 * that was stopped since the cookie was set no longer resolves), which is
 * the "verify the config hasn't changed" half of the sticky contract.
 */
function resolveVariant(request: NextRequest, config: ExperimentConfig, userId: string): Resolution {
  if (config.status !== 'running') return null;

  const version = configVersion(config);
  const stickyCookieName = STICKY_COOKIE_PREFIX + config.key;
  const stickyRaw = request.cookies.get(stickyCookieName)?.value;

  if (stickyRaw) {
    const separatorIndex = stickyRaw.lastIndexOf(':');
    const storedVariant = stickyRaw.slice(0, separatorIndex);
    const storedVersion = stickyRaw.slice(separatorIndex + 1);
    if (storedVersion === version && storedVariant) {
      return { variantKey: storedVariant, version, isFresh: false };
    }
  }

  const result = assign(config, { userId });
  if (result.status !== 'assigned') return null;

  return { variantKey: result.variantKey, version, isFresh: true };
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const existingUid = request.cookies.get(UID_COOKIE)?.value;
  const userId = existingUid ?? crypto.randomUUID();

  const stickyCookiesToSet: { name: string; value: string }[] = [];
  const forwardedHeaders = new Headers(request.headers);

  let redirectTarget: string | null = null;

  if (pathname === '/checkout' || pathname === '/checkout-v2') {
    const checkoutConfig = getExperiment(CHECKOUT_FLOW_EXPERIMENT_KEY);
    if (checkoutConfig) {
      const resolution = resolveVariant(request, checkoutConfig, userId);
      if (resolution) {
        if (resolution.isFresh) {
          stickyCookiesToSet.push({
            name: STICKY_COOKIE_PREFIX + checkoutConfig.key,
            value: `${resolution.variantKey}:${resolution.version}`,
          });
        }
        forwardedHeaders.set(VARIANT_HEADER_PREFIX + checkoutConfig.key, resolution.variantKey);

        const canonicalPath = CHECKOUT_PATH_BY_VARIANT[resolution.variantKey];
        if (canonicalPath && canonicalPath !== pathname) {
          redirectTarget = canonicalPath;
        }
      }
    }
  }

  if (pathname === '/pricing') {
    const pricingConfig = getExperiment(PRICING_CTA_EXPERIMENT_KEY);
    if (pricingConfig) {
      const resolution = resolveVariant(request, pricingConfig, userId);
      if (resolution) {
        if (resolution.isFresh) {
          stickyCookiesToSet.push({
            name: STICKY_COOKIE_PREFIX + pricingConfig.key,
            value: `${resolution.variantKey}:${resolution.version}`,
          });
        }
        forwardedHeaders.set(VARIANT_HEADER_PREFIX + pricingConfig.key, resolution.variantKey);
      }
    }
  }

  // Redirect happens before any page rendering — this is what makes it
  // flicker-free: the browser never receives the "wrong" page's HTML.
  const response = redirectTarget
    ? NextResponse.redirect(new URL(redirectTarget + request.nextUrl.search, request.url))
    : NextResponse.next({ request: { headers: forwardedHeaders } });

  if (!existingUid) {
    response.cookies.set(UID_COOKIE, userId, {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: true,
    });
  }

  for (const cookie of stickyCookiesToSet) {
    response.cookies.set(cookie.name, cookie.value, {
      maxAge: 60 * 60 * 24 * 90,
      sameSite: 'lax',
      httpOnly: true,
    });
  }

  return response;
}
