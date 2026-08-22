/**
 * FNV-1a is used here instead of a cryptographic hash (SHA-256, MD5, etc.) or a
 * general-purpose non-crypto hash (MurmurHash, xxHash) for three reasons:
 *  1. It is dependency-free and ~6 lines of pure arithmetic, so it runs identically
 *     in Node.js, browsers, and edge runtimes without pulling in the Node `crypto`
 *     module (which doesn't exist on the Edge Runtime / in the browser).
 *  2. It is fast — a single pass over the input string, no block padding, no
 *     multi-round mixing.
 *  3. For short strings (userId:experimentKey style bucketing keys) its avalanche
 *     behavior is good enough to distribute buckets uniformly. We are not
 *     defending against an adversary crafting inputs to collide buckets — this is
 *     not a security boundary — so we don't need cryptographic properties like
 *     preimage resistance.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Hashes an arbitrary string to a bucket in [0, 9999] using FNV-1a, followed
 * by a finalization/avalanche step.
 *
 * Plain FNV-1a under-mixes its most-recently-processed bytes: each byte only
 * passes through a single XOR + multiply before contributing to the output,
 * so the low-order bits of the final hash end up correlated with the low
 * bits of the *tail* of the input. Bucket keys here look like
 * `${userId}:${experimentKey}:${seed}` — two different experiment keys for
 * the same user share the same trailing `:${seed}` suffix — and since
 * `% 10000` is dominated by low-order bits, plain FNV-1a measurably
 * correlates a user's bucket across experiments that share a seed (verified
 * by the chi-squared/correlation checks in `test/hash.test.ts`, which fail
 * without this step). The fix is a standard integer finalizer (the same
 * shift-multiply-shift construction MurmurHash3 uses to fully avalanche its
 * 32-bit output) applied to the FNV-1a result before bucketing. This keeps
 * the implementation dependency-free and only a few extra lines.
 */
function avalanche(hash: number): number {
  let h = hash;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h;
}

export function hashToBucket(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by the FNV prime using Math.imul to keep the operation within
    // 32-bit integer semantics (JS numbers are floats; imul avoids precision
    // loss/overflow surprises that plain `*` would introduce here).
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Force unsigned 32-bit, then compress into [0, 9999].
  const unsigned = avalanche(hash) >>> 0;
  return unsigned % 10000;
}

/**
 * Builds the deterministic key that gets hashed to produce a user's bucket.
 *
 * CRITICAL: the key must combine userId + experimentKey (+ optional seed), and
 * must NEVER be just the userId alone. If buckets were derived from userId
 * alone, a given user would land in the *same relative bucket position* in
 * every experiment they're ever enrolled in — e.g. always in the bottom 10% of
 * the bucket space. That silently correlates a user's variant across
 * unrelated experiments: someone who happens to be "bucket 42" would always
 * get the control (or always the treatment) everywhere, biasing results for
 * any experiment that happens to interact with whatever that user segment
 * represents. Hashing on userId + experimentKey together makes each
 * experiment's bucketing independent of every other experiment's, which is
 * required for valid, uncorrelated A/B results.
 */
export function bucketKey(userId: string, experimentKey: string, seed?: number): string {
  return `${userId}:${experimentKey}:${seed ?? 0}`;
}
