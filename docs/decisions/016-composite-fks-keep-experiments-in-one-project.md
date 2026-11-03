# 016. Composite foreign keys keep an experiment inside one project

## Context
An experiment points to an environment and a folder, and both belong to a project. With plain foreign keys, an experiment could point to Shop A's environment and Shop B's folder. IDs are guessable, so a buggy or malicious request could create that.

## Options
- Check in app code that the environment and folder share a project
- Store project_id on experiments and use composite foreign keys

## Decision
experiments has a project_id. Its foreign keys point at pairs: (environment_id, project_id) to environments (id, project_id), and (folder_id, project_id) to folders (id, project_id). Environments and folders get UNIQUE (id, project_id) so the pairs can be referenced.

## Why
The database rejects a mismatch even if a code path forgets to check. The copied project_id can't drift, because the foreign keys keep it consistent with both parents.
