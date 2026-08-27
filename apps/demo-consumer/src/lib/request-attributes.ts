import { userAgent, type NextRequest } from 'next/server';

type AttributeExtractor = (request: NextRequest) => [key: string, value: string | number | undefined];

/**
 * A small, explicit registry of context attributes — not a generic
 * pass-through of every query param on the URL. Two reasons: query-param
 * values are user-controlled and spoofable (fine for campaign-style
 * targeting, not something to trust blindly), and sticky assignment only
 * re-checks targeting when the assignment itself is (re)computed, not on
 * every request — so a fully dynamic attribute set would make "why did
 * targeting behave differently this time" harder to reason about than a
 * short, named list.
 *
 * Adding a new context key later is exactly one entry in this array —
 * nothing else (middleware.ts, resolveVariant) needs to change.
 */
const ATTRIBUTE_EXTRACTORS: AttributeExtractor[] = [
  (request) => {
    // Next's own UA parser — no new dependency, no hand-rolled regex.
    const deviceType = userAgent(request).device.type;
    const isMobile = deviceType === 'mobile' || deviceType === 'tablet';
    return ['device', isMobile ? 'mobile' : 'desktop'];
  },
  (request) => ['src', request.nextUrl.searchParams.get('src') ?? undefined],
];

export function getRequestAttributes(request: NextRequest): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};
  for (const extract of ATTRIBUTE_EXTRACTORS) {
    const [key, value] = extract(request);
    if (value !== undefined) attributes[key] = value;
  }
  return attributes;
}
