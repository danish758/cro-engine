# Docs

- [spec.md](spec.md): v1 and v2 features, and the rules v1 follows
- [schema.md](schema.md): tables, relationships and columns for the v1 backend (SQL in [`apps/api/db/schema.sql`](../apps/api/db/schema.sql))
- [decisions/](decisions/): one short record per design decision, numbered in order

Decision records are never deleted. If a decision changes, add a new record that says which one it replaces.

These docs cover the platform rebuild (the API in `apps/api`). The root [DESIGN.md](../DESIGN.md) covers the engine packages. The v1 Next.js build is documented in the separate `platform` repo.
