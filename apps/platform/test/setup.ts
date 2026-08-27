import { execSync } from 'node:child_process';

const TEST_DB_NAME = 'cro_engine_test';
export const TEST_DATABASE_URL = `postgresql://cro:cro@localhost:55432/${TEST_DB_NAME}`;

/**
 * Creates (idempotently) a throwaway Postgres database on the same local
 * Docker Compose instance used for dev, then pushes the current schema to
 * it. Never touches the dev database (`cro_engine`) — tests get their own
 * database, not just their own rows, since Prisma's schema push in dev mode
 * can prompt for destructive resets that must never run against real data.
 */
export function setupTestDatabase(): void {
  execSync(
    `docker exec cro-engine-postgres-1 psql -U cro -d cro_engine -tc "SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'" | grep -q 1 || docker exec cro-engine-postgres-1 psql -U cro -d cro_engine -c "CREATE DATABASE ${TEST_DB_NAME}"`,
    { stdio: 'pipe', shell: '/bin/bash' }
  );

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
