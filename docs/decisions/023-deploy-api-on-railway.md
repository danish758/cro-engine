# 023. Deploy the API on Railway

## Context
v1 works locally. The API needs a public home with Postgres, so the SDK and later the dashboard can use it. The goal is to learn deployment properly, without spending weeks on infrastructure first.

## Options
- Railway: dashboard-driven, builds from a Dockerfile, managed Postgres, private networking
- Fly.io: CLI and config file, more control over regions and machines
- AWS (ECS or EC2 + RDS): the most transferable skills, but many services to wire together (VPC, IAM, load balancer)

## Decision
Railway, with the API built from our own `Dockerfile` (not Railway's auto-detection).

| Piece | Setup |
| --- | --- |
| Image | `node:22-slim`, package files copied first for layer caching, `npm ci`, build `assignment-engine` only, `CMD ["node", "src/index.ts"]` |
| Database | Railway Postgres, **private networking only** (no public TCP proxy) |
| App's DB user | `app_user` only. The API never gets the owner password (no `MIGRATION_DATABASE_URL` in production) |
| Migrations | Run by hand from a laptop as the owner, through `railway connect <db> --tunnel-only` |
| Order on a new database | create `app_user` → run migrations (they GRANT to it) → deploy the API |
| Variables | `NODE_ENV`, `DATABASE_URL` (built from `${{...}}` references to the DB service), `DASHBOARD_ORIGIN`. `PORT` is set by Railway |
| Proxy | `app.set('trust proxy', 1)`: exactly one proxy (Railway's) in front of the API |
| Shutdown | On SIGTERM: stop accepting connections, finish in-flight requests, close the pool, exit; force exit after 10 s |

## Why
- Ship first, learn the fundamentals (containers, env vars, private networks, signals) on a platform that doesn't hide them all
- Our own Dockerfile runs the same on a laptop, Railway, or AWS later, so moving hosts doesn't mean rebuilding
- Private database + tunnel: the database has no public address at all, so a leaked password alone isn't enough to reach it
- Least privilege (018): a bug or leak in the API can't drop tables or rewrite audit logs
- Manual migrations keep the owner password out of the running app. Trade-off: one more manual step per schema change. Revisit with Railway's pre-deploy command if that gets painful
- `trust proxy 1`, not `true`: only the rightmost `X-Forwarded-For` entry is written by Railway's proxy; `true` would let clients spoof their IP and bypass the rate limit

## Known limits
- Rate-limit store is in memory: it resets on every deploy and doesn't work across several instances
- Railway changes are staged until "Deploy" is clicked; a never-applied service caused a 404 on `railway up`

## Verified
`/health` returns `{"status":"ok","database":"ok"}` from the Railway URL; `docker stop` locally shows "SIGTERM received" then "Shutdown complete"; the SDK demo assigns visitors from production.
