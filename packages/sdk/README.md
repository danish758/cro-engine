# @cro-engine/sdk

The client SDK for the CRO Engine platform — install this in *your* app to
run experiments defined in your CRO Engine project. This is the piece that
makes the platform something other projects can actually integrate with,
the way you'd integrate AB Tasty or GrowthBook, rather than a demo you'd
have to fork.

## What this is (and isn't)

This is a thin client around two things: fetching your project's experiment
config from the platform, and evaluating bucketing **locally** using
[`@cro-engine/assignment-engine`](../assignment-engine). It is not a
reimplementation of the bucketing logic — `assign()` is called directly from
the engine package, so this SDK gets every correctness property that package
already has (deterministic hashing, fail-closed targeting, etc.) for free.

## Why local evaluation

The naive design for a hosted experimentation platform is "call our API on
every page load to ask which variant to show." That's the wrong shape: it
adds the platform's network latency to every request, and it makes your
app's checkout page depend on the platform's uptime. Real experimentation
platforms (GrowthBook, Statsig, LaunchDarkly) don't work that way — their
SDKs fetch config periodically, cache it locally, and evaluate bucketing
in your own process. Only exposure/conversion events flow back to the
platform, asynchronously.

`CroEngineClient.assign()` follows the same pattern: it fetches (or reuses a
cached copy of) your project's config, then calls `assign()` from
`@cro-engine/assignment-engine` in-process. There's no network call on the
common path — only when the cache is cold or has expired.

The cache itself is refreshed **lazily**, checked inside `assign()`, not via
a background `setInterval`. A timer doesn't reliably survive between
invocations in serverless/edge environments, where your app may get a fresh
instance per request. Lazy-refresh-on-use degrades gracefully instead: a
cold instance just pays one extra fetch on its first call, and if that fetch
fails, a still-cached (if stale) config is served rather than throwing —
a transient blip talking to the platform shouldn't break bucketing for a
page that was working a moment ago.

## Quickstart

```bash
npm install @cro-engine/sdk
```

```typescript
import { CroEngineClient } from '@cro-engine/sdk';

const client = new CroEngineClient({
  apiKey: process.env.CRO_ENGINE_API_KEY!,
  apiUrl: process.env.CRO_ENGINE_API_URL!, // e.g. your platform deployment's URL
});

// Bucketing — evaluated locally after the first fetch.
const result = await client.assign('checkout-flow-v2', { userId: 'user-123' });
if (result.status === 'assigned') {
  console.log(`variant: ${result.variantKey}`);
}

// Tracking — queued, sent as one batched request on flush().
client.trackExposure('user-123', 'checkout-flow-v2', 'variant');
client.trackConversion('user-123', 'purchase_completed', 49);
await client.flush();
```

In Next.js, the natural place to call `flush()` is inside `after()` (from
`next/server`), so it never blocks the response — see
[`apps/demo-consumer`](../../apps/demo-consumer) for a full worked example,
including sticky-assignment cookies and a flicker-free redirect experiment
driven entirely by this SDK.

**Keep the API key server-side.** Instantiate `CroEngineClient` in a Server
Component, Route Handler, or middleware — never in client-side/browser code.
An API key embedded in browser JS is visible to anyone, letting them send
arbitrary events under your project's identity. If you need client-triggered
tracking (a button click), have the browser call your *own* server route,
which then calls the SDK — the same pattern `apps/demo-consumer`'s
`/api/convert` route uses.

## API

- `new CroEngineClient({ apiKey, apiUrl, cacheTtlMs? })` — `cacheTtlMs` defaults to 30s.
- `client.assign(experimentKey, ctx) => Promise<AssignmentResult>` — fetches/caches config, evaluates locally.
- `client.getConfig(experimentKey) => Promise<ExperimentConfig | undefined>` — the raw config, same cache as `assign()`. Useful when you need the config itself (e.g. to fingerprint it for a sticky-cookie cache, as the demo consumer app does), not just an assignment decision.
- `client.trackExposure(userId, experimentKey, variantKey)` — queues, doesn't send.
- `client.trackConversion(userId, eventName, value?)` — queues, doesn't send.
- `client.flush() => Promise<void>` — sends everything queued as one request. Never throws (best-effort delivery).

## Running tests

```bash
npm install
npm test
```

Tests mock `fetch` directly (this package's own I/O boundary) — no server or
database needed. They cover caching (single fetch reused within TTL,
concurrent calls coalesced into one request, stale-cache fallback on a
failed refresh) and event batching/flush behavior.
