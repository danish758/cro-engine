// Stable, long-lived per-user id used as the bucketing userId for every
// experiment. Set once by middleware on a user's first request.
export const UID_COOKIE = 'exp_uid';

// Sticky-assignment cookie prefix: `${STICKY_COOKIE_PREFIX}${experimentKey}`
// stores `${variantKey}:${configVersion}` so repeat visits don't re-randomize
// a user (see middleware.ts for the version-invalidation logic).
export const STICKY_COOKIE_PREFIX = 'exp_sticky_';

// Request header prefix middleware uses to tell Server Components which
// variant the current request was assigned, e.g. `x-exp-pricing-cta-copy`.
export const VARIANT_HEADER_PREFIX = 'x-exp-';
