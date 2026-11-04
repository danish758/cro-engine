# 017. NO ACTION instead of RESTRICT for experiments' environment and folder

## Context
An environment or folder that still has experiments must not be deleted. Deleting a project must delete everything, including those environments, folders and experiments.

With RESTRICT on experiments.environment_id, deleting a project fails: RESTRICT checks immediately, while experiments still exist.

## Decision
- experiments.project_id: ON DELETE CASCADE
- experiments (environment_id, project_id) and (folder_id, project_id): ON DELETE NO ACTION

## Why
NO ACTION checks at the end of the statement. A direct environment or folder delete still fails while experiments exist. A project delete cascades away its experiments within the same statement, so the check passes.

Archived experiments also block deleting an environment. Environments are long-lived, so database protection is worth more than being able to delete one. For folders, app code moves archived experiments to the default folder before deleting.

## Verified
Tested in psql: deleting an environment with an experiment fails; deleting its project succeeds and removes the experiment.
