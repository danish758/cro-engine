# 005. Variants are a separate table

## Context
Variants could be a JSONB array on the experiment, or rows in their own table.

## Options
- JSONB on experiments: simpler reads, keeps order, allows a single-row check that weights sum to 100
- Separate table: database constraints and foreign keys

## Decision
A variants table with a position column. Always read with ORDER BY position.

## Why
- v2 events need to reference a variant, and a foreign key guarantees it exists
- Unique variant key per experiment and "exactly one control" become database constraints
- Postgres doesn't guarantee row order without ORDER BY, and the assignment engine depends on order

The cost: "weights sum to 100" can't be a constraint across rows, so it's checked in app code inside the save transaction.
