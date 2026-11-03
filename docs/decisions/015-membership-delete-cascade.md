# 015. Memberships cascade on user and project delete

## Context
Deleting a user or a project leaves their memberships pointing at nothing. Each project must keep at least one admin, which no foreign key can check.

## Options
- user_id ON DELETE RESTRICT: deleting a user fails until their memberships are removed, forcing the app through the remove-member path and its admin check
- user_id ON DELETE CASCADE: memberships are removed automatically; the admin check lives in app code before the delete

## Decision
CASCADE on both user_id and project_id. Before deleting a user, app code checks whether they're the last admin of any project and blocks the delete if so.

## Why
Simpler deletes, with one clear place for the check. The known risk: if a code path skips the check, the database won't stop a project losing its last admin. Tests must cover that case.
