# 002. Each experiment belongs to one environment

## Context
Projects have several environments (staging, production, custom). An experiment could be shared across them, or exist separately in each.

## Options
- One experiment shared by all environments, with status per environment (GrowthBook style)
- A separate experiment record per environment (AB Tasty style)

## Decision
Each experiment belongs to exactly one environment. Its targeting, variants, status and logs are independent of other environments.

## Why
Environments should be fully independent: testing in staging must never affect production. One owner per row is also simpler to model and to query.
