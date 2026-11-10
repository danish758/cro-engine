# 009. Archive what has history, delete only unused configuration

## Decision
- Experiments: archived (not while running)
- API keys: revoked, row kept
- Folders: deleted at any time; their experiments become "no folder" (updated by 022)
- Context keys: deleted only when nothing uses them
- Environments: deleted only when they have no experiments; their API keys are deleted with them (ON DELETE CASCADE). Every environment always has an active key, so blocking on keys would make environments impossible to delete
- Projects: deleted with everything in them, admins only

## Why
Experiments have logs and, later, results. Revoked keys keep audit entries meaningful. Unused configuration has nothing worth keeping.
