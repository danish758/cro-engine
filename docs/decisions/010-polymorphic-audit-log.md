# 010. One audit log table with a polymorphic reference

## Context
The audit log records changes to many kinds of entities.

## Options
- A foreign key to every table, or a log table per entity
- One table with entity_type and entity_id

## Decision
One audit_logs table with entity_type and entity_id, a direct project_id, and a user_id that becomes NULL if the user is deleted.

## Why
One mechanism for every entity. The database can't guarantee entity_id still exists, which is acceptable: the deletion itself is logged. project_id is direct because the changed entity may be gone, so the project can't be found through it.
