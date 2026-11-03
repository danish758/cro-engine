# 013. Assignments are not stored

## Context
The assignment engine hashes visitor id, experiment key and seed into a bucket. The same input always gives the same variant.

## Decision
No assignments table in v1. The SDK computes assignments; the platform stores and serves config only.

## Why
Assignments can always be recomputed. Locking config after the first run (004) keeps them stable. Exposure events in v2 record what visitors actually saw.
