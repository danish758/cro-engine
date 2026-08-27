/**
 * Middleware encodes a forced variant as `${variantKey}|forced` in the
 * header value, rather than a parallel header per experiment. Pages use
 * this to split the two apart and know whether to skip trackExposure() —
 * QA/testing overrides must never count as real visitors on the dashboard.
 */
export function parseVariantHeader(headerValue: string | null): { variantKey: string | null; isForced: boolean } {
  if (!headerValue) return { variantKey: null, isForced: false };
  const [variantKey, marker] = headerValue.split('|');
  return { variantKey: variantKey ?? null, isForced: marker === 'forced' };
}
