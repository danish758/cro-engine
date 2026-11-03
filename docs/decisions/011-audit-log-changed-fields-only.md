# 011. Audit log stores changed fields for updates

## Options
- Full snapshot before and after on every change
- Changed fields only

## Decision
Updates store only the changed fields in before and after (JSONB). Creates store the full row in after. Deletes store the full row in before. Secrets are never logged.

## Why
An update log reads as a list of changes ("status: draft to running") instead of two near-identical copies. Nothing is lost on create or delete.
