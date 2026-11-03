# 008. One public, read-only API key per environment

## Context
The SDK runs in websites and needs to fetch experiment config.

## Decision
Each environment has a public key, visible to admins at all times, with regenerate. Old keys are revoked, not deleted. The key returns only running experiments in its environment, and only the fields the SDK needs.

## Why
The key is embedded in website JavaScript, so it's public anyway. Least privilege keeps drafts, logs and member data out of reach. Secret keys (hashed, shown once) are v2.
