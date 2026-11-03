# 019. The API lives in the cro-engine monorepo

## Context
The engine packages (assignment-engine, stats-engine, sdk) live in cro-engine, an npm workspaces repo. The v1 Next.js app lives in a separate repo, platform. The new Express API depends on the packages and shares types like ExperimentConfig with them.

## Options
- A new separate repo for the API, installing the packages from npm
- Turn platform into a monorepo (move the Next.js app to apps/web, bring the packages in)
- Add the API to cro-engine as apps/api

## Decision
cro-engine is the monorepo. The API is apps/api, linked to the local packages through npm workspaces. Docs live at the repo root. The v1 platform repo stays untouched as a reference, and can move in later as apps/web.

## Why
- Package changes reach the API immediately, with no publish step in between
- One change can update the engine, SDK and API together
- cro-engine was already a workspace monorepo, so this needed the fewest changes
- Matches how GrowthBook and PostHog organize their platforms

The cost: monorepo tooling to learn alongside backend, and care when publishing only some folders to npm.
