# 022. Folders are optional

## Context
Folders were required: every experiment had one, and each project got a default "General" folder that couldn't be deleted. Deleting a folder needed a rule for its archived experiments, and moving them silently to General was surprising and lost their origin.

## Options
- Any experiment, archived included, blocks deleting a folder
- Delete archived experiments with the folder
- Archive folders instead of deleting them
- Make folders optional: deleting a folder un-files its experiments

## Decision
Folders are optional labels. `experiments.folder_id` is nullable, and the composite foreign key uses `ON DELETE SET NULL (folder_id)`, so only `folder_id` is emptied and `project_id` stays. The General folder and the `is_default` column are removed (migration 004).

## Why
- Matches AB Tasty Web Experimentation: deleting a folder doesn't delete its campaigns; they stay in the main list
- Nothing is blocked, moved or lost, and no app code is needed to enforce it
- Removes the default folder, its column, its partial index and the "can't delete General" rule

Postgres 15+ is required for the column list in `SET NULL (folder_id)`. A plain `SET NULL` would also empty `project_id`, which is NOT NULL, so the delete would fail.
