# 003. Experiment keys are unique per environment

## Context
The SDK refers to experiments by key, and the assignment engine hashes on it.

## Decision
Unique on (environment, key). The key never changes. The same key can exist in different environments. Duplicating within an environment requires a new key; duplicating to another environment can keep it.

## Why
Website code uses the same key in every environment. Changing a key would reshuffle every visitor, because the key is part of the hash.
