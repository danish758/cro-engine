# 018. Separate database users for migrations and the app

## Context
Audit logs must be append-only (012). In Postgres, every table has an owner, and the owner can do anything to it, whatever REVOKE says. If the app connects as the owner, nothing in the database stops it from updating or deleting logs.

## Options
- One database user for everything, with append-only enforced only in app code
- A trigger that rejects UPDATE and DELETE on audit_logs
- Two database users: an owner for migrations, and a restricted user for the app

## Decision
Two users:

| User | Used by | Can do |
| --- | --- | --- |
| migration user (owns all tables) | migrations, run by a developer | Everything: create, alter, drop |
| app user | the Express API at runtime | SELECT, INSERT, UPDATE, DELETE on rows. On audit_logs: SELECT and INSERT only |

```sql
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
```

## Why
- A trigger would also fire during the cascade when a project is deleted, so project deletion would fail
- REVOKE doesn't limit the owner, so the app must connect as a different user
- Least privilege: if the app is ever compromised (for example, SQL injection), the attacker can't drop tables or rewrite the audit history

## To verify
Deleting a project as the app user still removes its audit logs (cascades should run with the table owner's permissions), while a direct DELETE on audit_logs fails.
