import { describe, expect, it } from 'vitest';
import { bucketKey, hashToBucket } from '../src/hash.js';

describe('hashToBucket', () => {
  it('is stable — same input always returns the same output', () => {
    const input = 'user-123:checkout-flow-v2:0';
    const first = hashToBucket(input);
    const second = hashToBucket(input);
    const third = hashToBucket(input);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it('always returns a value in [0, 9999]', () => {
    for (let i = 0; i < 1000; i++) {
      const bucket = hashToBucket(`user-${i}`);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(9999);
    }
  });

  it('distributes ~100,000 users across a 50/50 split within ~1%', () => {
    const total = 100_000;
    let variantACount = 0;

    for (let i = 0; i < total; i++) {
      const bucket = hashToBucket(bucketKey(`user-${i}`, 'distribution-test'));
      if (bucket < 5000) variantACount++;
    }

    const ratio = variantACount / total;
    expect(ratio).toBeGreaterThan(0.49);
    expect(ratio).toBeLessThan(0.51);
  });

  it('produces independent buckets across two different experiment keys (no correlation)', () => {
    const sampleSize = 20_000;
    const bucketsA: number[] = [];
    const bucketsB: number[] = [];

    for (let i = 0; i < sampleSize; i++) {
      const userId = `user-${i}`;
      bucketsA.push(hashToBucket(bucketKey(userId, 'experiment-a')));
      bucketsB.push(hashToBucket(bucketKey(userId, 'experiment-b')));
    }

    // 2x2 contingency table: is user in "top half" of bucket space for A vs B?
    let both = 0;
    let aOnly = 0;
    let bOnly = 0;
    let neither = 0;

    for (let i = 0; i < sampleSize; i++) {
      const inTopA = (bucketsA[i] as number) >= 5000;
      const inTopB = (bucketsB[i] as number) >= 5000;
      if (inTopA && inTopB) both++;
      else if (inTopA && !inTopB) aOnly++;
      else if (!inTopA && inTopB) bOnly++;
      else neither++;
    }

    // Chi-squared test of independence for a 2x2 table.
    const n = sampleSize;
    const rowA = both + aOnly; // inTopA total
    const rowNotA = bOnly + neither;
    const colB = both + bOnly; // inTopB total
    const colNotB = aOnly + neither;

    const expected = {
      both: (rowA * colB) / n,
      aOnly: (rowA * colNotB) / n,
      bOnly: (rowNotA * colB) / n,
      neither: (rowNotA * colNotB) / n,
    };

    const chiSquared =
      Math.pow(both - expected.both, 2) / expected.both +
      Math.pow(aOnly - expected.aOnly, 2) / expected.aOnly +
      Math.pow(bOnly - expected.bOnly, 2) / expected.bOnly +
      Math.pow(neither - expected.neither, 2) / expected.neither;

    // For a 2x2 table (1 degree of freedom), the critical value at p=0.001 is
    // ~10.83. We use this stricter (rather than p=0.05's 3.841) threshold to
    // keep the test from being flaky on true independence — a real
    // correlation bug (e.g. hashing on userId alone, or under-mixed hash
    // finalization) produces a chi-squared value at least an order of
    // magnitude larger than this, so the margin is safe.
    expect(chiSquared).toBeLessThan(10.83);

  });
});

describe('bucketKey', () => {
  it('combines userId, experimentKey, and seed into a stable string', () => {
    expect(bucketKey('user-1', 'exp-a')).toBe('user-1:exp-a:0');
    expect(bucketKey('user-1', 'exp-a', 5)).toBe('user-1:exp-a:5');
  });

  it('produces different keys for different experiments given the same user', () => {
    expect(bucketKey('user-1', 'exp-a')).not.toBe(bucketKey('user-1', 'exp-b'));
  });
});
