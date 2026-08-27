import { CroEngineClient } from '@cro-engine/sdk';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} — see .env.example`);
  return value;
}

// Singleton, same globalThis-caching pattern the platform app uses for its
// Prisma client — this is what makes the SDK's config cache actually useful
// (a fresh client per call would mean every single request pays a cold-cache
// fetch, defeating the point). Works in both the Edge Runtime (middleware)
// and Node (page Server Components) since it's plain globalThis, not a
// Node-specific API.
const globalForCroEngine = globalThis as unknown as { croEngineClient?: CroEngineClient };

export const croEngine: CroEngineClient =
  globalForCroEngine.croEngineClient ??
  new CroEngineClient({
    apiKey: requireEnv('CRO_ENGINE_API_KEY'),
    apiUrl: requireEnv('CRO_ENGINE_API_URL'),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForCroEngine.croEngineClient = croEngine;
}
