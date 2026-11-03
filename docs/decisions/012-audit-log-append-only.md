# 012. Audit logs are append-only

## Decision
Log rows are only inserted, never updated or deleted. Every create, update and delete in a project writes its log entry in the same transaction as the change. Reads, SDK config requests and logins are not logged here.

## Why
A history that can be edited can't be trusted. Writing the change and its log together keeps them consistent.

## Update
Enforcement is decided in the schema: REVOKE UPDATE, DELETE from the app's database user. See the decision record on database users.
