# 014. Bigint identity primary keys

## Context
Every table needs a primary key, and IDs appear in API URLs.

## Options
- bigint GENERATED ALWAYS AS IDENTITY: small, sequential, readable
- Random UUID (v4): unguessable, but larger and scatters index inserts
- UUIDv7: time-ordered, avoids the index scatter, still 16 bytes

## Decision
bigint GENERATED ALWAYS AS IDENTITY on every table, except memberships, which uses a composite primary key (user_id, project_id).

## Why
Simplicity and readability: IDs like 42 are easy to debug, type in psql and read in logs. Keys stay small in indexes and foreign keys, though at this scale the performance difference wouldn't be measurable.

Guessable IDs are acceptable because access is checked through memberships on every request, never by hiding IDs. The known cost is that sequential IDs reveal rough counts (users, projects). UUIDv7 is the alternative if that ever matters.
