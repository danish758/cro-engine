import {
  assign,
  type AssignmentContext,
  type AssignmentResult,
  type ExperimentConfig,
} from '@cro-engine/assignment-engine';

export type CroEngineClientOptions = {
  /** A project's API key, from the platform's dashboard. */
  apiKey: string;
  /** Base URL of the CRO Engine platform, e.g. http://localhost:3000. */
  apiUrl: string;
  /** How long a fetched config stays fresh before the next assign() call
   * triggers a refetch. Default 30s. */
  cacheTtlMs?: number;
};

type QueuedExposure = { userId: string; experimentKey: string; variantKey: string };
type QueuedConversion = { userId: string; eventName: string; value?: number };

const DEFAULT_CACHE_TTL_MS = 30_000;

/**
 * The local-evaluation client: `assign()` fetches (or reuses a cached copy
 * of) this project's experiment configs, then evaluates bucketing LOCALLY
 * via `assign()` from `@cro-engine/assignment-engine` — there is no network
 * call to the platform on the common path, only on a cold or stale cache.
 * This is deliberate: a consuming app's page render should never wait on
 * the platform being reachable to decide which variant to show.
 *
 * The cache is refreshed lazily (checked/refetched inside `assign()`), not
 * via a background `setInterval` — a timer doesn't reliably survive between
 * requests in serverless/edge environments, where each invocation may get a
 * fresh instance. Lazy-refresh-on-use degrades gracefully instead: a cold
 * instance just pays one extra fetch on its first call.
 */
export class CroEngineClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly cacheTtlMs: number;

  private cachedConfigs: ExperimentConfig[] | null = null;
  private cachedAt = 0;
  private pendingFetch: Promise<ExperimentConfig[]> | null = null;

  private queuedExposures: QueuedExposure[] = [];
  private queuedConversions: QueuedConversion[] = [];

  constructor(options: CroEngineClientOptions) {
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl.replace(/\/+$/, '');
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  private async getConfigs(): Promise<ExperimentConfig[]> {
    const isStale = !this.cachedConfigs || Date.now() - this.cachedAt >= this.cacheTtlMs;
    if (!isStale) return this.cachedConfigs as ExperimentConfig[];

    // Coalesce concurrent refreshes into one in-flight request — several
    // assign() calls hitting a cold/stale cache at once (e.g. multiple
    // experiments checked on the same page render) share a single fetch
    // rather than each firing their own.
    if (!this.pendingFetch) {
      this.pendingFetch = this.fetchConfigs().finally(() => {
        this.pendingFetch = null;
      });
    }
    return this.pendingFetch;
  }

  private async fetchConfigs(): Promise<ExperimentConfig[]> {
    try {
      const res = await fetch(`${this.apiUrl}/api/v1/config`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) throw new Error(`cro-engine: config fetch failed with status ${res.status}`);

      const body = (await res.json()) as { experiments: ExperimentConfig[] };
      this.cachedConfigs = body.experiments;
      this.cachedAt = Date.now();
      return this.cachedConfigs;
    } catch (err) {
      // A transient network blip to the platform shouldn't break bucketing
      // for a page that was working a moment ago — prefer serving a stale
      // cache over throwing, if one exists.
      if (this.cachedConfigs) return this.cachedConfigs;
      throw err;
    }
  }

  /**
   * Returns the raw config for one experiment (or undefined if unknown),
   * using the same cache as assign(). Exposed separately from assign()
   * because some callers need the config itself, not just an assignment
   * decision — e.g. fingerprinting it to invalidate a sticky-assignment
   * cookie when variants/seed change (see apps/demo-consumer/src/middleware.ts).
   */
  async getConfig(experimentKey: string): Promise<ExperimentConfig | undefined> {
    const configs = await this.getConfigs();
    return configs.find((c) => c.key === experimentKey);
  }

  /**
   * Evaluates bucketing for one experiment. If the key isn't found in this
   * project's config (unknown key, or a transient fetch failure with no
   * prior cache), the user is excluded rather than the call throwing —
   * matching assign()'s own fail-closed philosophy for a bad/missing config.
   *
   * `options.forceVariant`, when it names a real variant on this experiment,
   * short-circuits straight to it — skipping status AND targeting entirely.
   * This is a QA/testing override, not a bucketing path: it deliberately
   * lets you preview a draft/stopped experiment or a targeting-excluded
   * variant without flipping status or faking attributes. `bucket: -1`
   * marks the result as not a real computed bucket for anything that
   * inspects it later. An unrecognized forceVariant (typo, removed variant)
   * silently falls through to normal assignment rather than excluding — a
   * stale QA link shouldn't look like a broken experiment.
   */
  async assign(
    experimentKey: string,
    ctx: AssignmentContext,
    options?: { forceVariant?: string }
  ): Promise<AssignmentResult> {
    const config = await this.getConfig(experimentKey);
    if (!config) return { status: 'excluded', reason: 'invalid-config' };

    if (options?.forceVariant && config.variants.some((v) => v.key === options.forceVariant)) {
      return { status: 'assigned', variantKey: options.forceVariant, bucket: -1 };
    }

    return assign(config, ctx);
  }

  /** Queues an exposure; does not send until flush(). */
  trackExposure(userId: string, experimentKey: string, variantKey: string): void {
    this.queuedExposures.push({ userId, experimentKey, variantKey });
  }

  /** Queues a conversion; does not send until flush(). */
  trackConversion(userId: string, eventName: string, value?: number): void {
    this.queuedConversions.push({ userId, eventName, value });
  }

  /**
   * Sends everything queued since the last flush as a single POST. Intended
   * to be called from a fire-and-forget hook (e.g. Next.js `after()`) so it
   * never blocks the caller's own response.
   */
  async flush(): Promise<void> {
    if (this.queuedExposures.length === 0 && this.queuedConversions.length === 0) return;

    const exposures = this.queuedExposures;
    const conversions = this.queuedConversions;
    this.queuedExposures = [];
    this.queuedConversions = [];

    try {
      await fetch(`${this.apiUrl}/api/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ exposures, conversions }),
      });
    } catch {
      // Best-effort delivery — a failed event POST should never throw into
      // the caller's request lifecycle.
    }
  }
}
