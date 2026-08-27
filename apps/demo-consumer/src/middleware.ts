import { NextResponse, type NextRequest } from 'next/server';
import type { ExperimentConfig } from '@cro-engine/assignment-engine';
import { STICKY_COOKIE_PREFIX, UID_COOKIE, VARIANT_HEADER_PREFIX } from '@/lib/constants';
import { croEngine } from '@/lib/cro-engine';
import { configVersion } from '@/lib/experiment-version';
import {
  CHECKOUT_FLOW_EXPERIMENT_KEY,
  PRICING_CTA_COLOR_EXPERIMENT_KEY,
  PRICING_CTA_EXPERIMENT_KEY,
} from '@/lib/experiments.config';
import { getRequestAttributes } from '@/lib/request-attributes';

// Back on the Edge Runtime — the whole point of the control/data-plane split
// is that this app has nothing that needs Node anymore. Bucketing decisions
// go through @cro-engine/sdk (fetch-only, cached locally), never a direct
// DB call, so there's no reason to pay for Node middleware here the way
// apps/platform does (which still needs Postgres for its own auth gate).
//
// NOTE: matcher must be a static array literal (Next.js extracts it via
// static analysis at build time, before this module is ever executed — a
// computed value like `Object.keys(ROUTE_EXPERIMENTS)` isn't guaranteed to
// be resolvable that way). Keep it in sync with ROUTE_EXPERIMENTS' keys by
// hand.
export const config = {
  matcher: ['/checkout', '/checkout-v2', '/pricing'],
};

/**
 * Which experiment keys matter on which route. This is what keeps
 * middleware's cost proportional to what a route actually uses instead of
 * bucketing every experiment on every request — the SDK's config fetch is
 * already shared/cached across all of them (see resolveVariant below), so
 * this table isn't about avoiding network calls, it's about not writing a
 * sticky cookie or forwarding a header for an experiment a page never reads
 * (cookie storage isn't free — browsers cap total cookie count/size per
 * domain, so bucketing 50 experiments on every route would eventually hit
 * that ceiling for no benefit).
 *
 * Deliberately app-side, not platform-side: the platform is route-agnostic
 * by design (the SDK has to work with any consuming app's file layout, not
 * just this one's), so it has no way to know this app's routes exist at
 * all. Adding an experiment to an existing route is a one-line change here,
 * not new logic — see DESIGN.md for the fuller reasoning.
 */
const ROUTE_EXPERIMENTS: Record<string, string[]> = {
  '/checkout': [CHECKOUT_FLOW_EXPERIMENT_KEY],
  '/checkout-v2': [CHECKOUT_FLOW_EXPERIMENT_KEY],
  '/pricing': [PRICING_CTA_EXPERIMENT_KEY, PRICING_CTA_COLOR_EXPERIMENT_KEY],
};

// Redirect-type experiments declare a canonical path per variant; everything
// else just sets a header for the page to read. Only checkout-flow-v2 does
// this today, but the shape supports more than one redirect-type experiment
// without changing the resolution loop below.
const CANONICAL_PATH_BY_EXPERIMENT: Record<string, Record<string, string>> = {
  [CHECKOUT_FLOW_EXPERIMENT_KEY]: { control: '/checkout', variant: '/checkout-v2' },
};

type Resolution = { variantKey: string; version: string; isFresh: boolean; isForced: boolean } | null;

/**
 * Same sticky-assignment contract as v1: a user with a valid (version-
 * matching) sticky cookie keeps their stored variant without recomputing;
 * status is still re-checked (via the SDK's cached config) on every
 * request. The only thing that changed is *where* the config comes from —
 * croEngine.getConfig() instead of a static import.
 *
 * `forceVariant`, when present, is tried first via the SDK's own forcing
 * support — bypassing status/targeting/sticky cookies entirely, and never
 * persisting anything (no cookie write). If the SDK reports the force
 * didn't actually apply (unrecognized variant — bucket won't be the -1
 * sentinel), this falls through to the normal path below exactly as if no
 * force had been requested, so a stale/typo'd QA link degrades to a real
 * assignment instead of silently doing nothing.
 */
async function resolveVariant(
  request: NextRequest,
  experimentKey: string,
  userId: string,
  attributes: Record<string, string | number>,
  forceVariant: string | undefined
): Promise<Resolution> {
  if (forceVariant) {
    const forcedResult = await croEngine.assign(experimentKey, { userId, attributes }, { forceVariant });
    if (forcedResult.status === 'assigned' && forcedResult.bucket === -1) {
      return { variantKey: forcedResult.variantKey, version: '', isFresh: false, isForced: true };
    }
    // forceVariant didn't name a real variant — fall through to normal
    // resolution below, same as if forceVariant had never been passed.
  }

  const config: ExperimentConfig | undefined = await croEngine.getConfig(experimentKey);
  if (!config || config.status !== 'running') return null;

  const version = configVersion(config);
  const stickyCookieName = STICKY_COOKIE_PREFIX + experimentKey;
  const stickyRaw = request.cookies.get(stickyCookieName)?.value;

  if (stickyRaw) {
    const separatorIndex = stickyRaw.lastIndexOf(':');
    const storedVariant = stickyRaw.slice(0, separatorIndex);
    const storedVersion = stickyRaw.slice(separatorIndex + 1);
    if (storedVersion === version && storedVariant) {
      return { variantKey: storedVariant, version, isFresh: false, isForced: false };
    }
  }

  const result = await croEngine.assign(experimentKey, { userId, attributes });
  if (result.status !== 'assigned') return null;

  return { variantKey: result.variantKey, version, isFresh: true, isForced: false };
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const existingUid = request.cookies.get(UID_COOKIE)?.value;
  const userId = existingUid ?? crypto.randomUUID();
  const attributes = getRequestAttributes(request);

  const stickyCookiesToSet: { name: string; value: string }[] = [];
  const forwardedHeaders = new Headers(request.headers);
  let redirectTarget: string | null = null;

  // Sequential, not Promise.all: the SDK coalesces concurrent config fetches
  // into one in-flight request anyway (see CroEngineClient.getConfigs), so
  // the first iteration here pays for the (possibly cold) fetch and every
  // later one in the same request hits the now-warm cache instantly —
  // parallelizing wouldn't save a real round trip, and sequential is
  // simpler to reason about while building up the response's cookies/headers.
  for (const experimentKey of ROUTE_EXPERIMENTS[pathname] ?? []) {
    // QA/testing override, URL param only — deliberately no cookie, so
    // forcing lasts exactly as long as the param is on the URL. Works
    // correctly through the redirect below too, since the redirect already
    // preserves the full query string.
    const forceVariant = request.nextUrl.searchParams.get(`cro_force_${experimentKey}`) ?? undefined;
    const resolution = await resolveVariant(request, experimentKey, userId, attributes, forceVariant);
    if (!resolution) continue;

    if (resolution.isFresh && !resolution.isForced) {
      stickyCookiesToSet.push({
        name: STICKY_COOKIE_PREFIX + experimentKey,
        value: `${resolution.variantKey}:${resolution.version}`,
      });
    }

    // Forcing is encoded straight into the variant header rather than a
    // parallel header per experiment — pages split on "|" and skip
    // trackExposure() when the second part is "forced", so QA/testing
    // views never count as real visitors on the dashboard.
    const headerValue = resolution.isForced ? `${resolution.variantKey}|forced` : resolution.variantKey;
    forwardedHeaders.set(VARIANT_HEADER_PREFIX + experimentKey, headerValue);

    const canonicalPath = CANONICAL_PATH_BY_EXPERIMENT[experimentKey]?.[resolution.variantKey];
    if (canonicalPath && canonicalPath !== pathname) {
      redirectTarget = canonicalPath;
    }
  }

  const response = redirectTarget
    ? NextResponse.redirect(new URL(redirectTarget + request.nextUrl.search, request.url))
    : NextResponse.next({ request: { headers: forwardedHeaders } });

  if (!existingUid) {
    response.cookies.set(UID_COOKIE, userId, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true });
  }

  for (const cookie of stickyCookiesToSet) {
    response.cookies.set(cookie.name, cookie.value, { maxAge: 60 * 60 * 24 * 90, sameSite: 'lax', httpOnly: true });
  }

  return response;
}
