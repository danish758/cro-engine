# 020. Cookie sessions stored in Postgres, not JWT

## Context
After login, the API needs to know who is calling on every following request. The v1 client is our own dashboard talking to one API with one database.

## Options
- JWT: a signed token the client sends with every request; no database lookup
- Session: a random token in a cookie, looked up in a sessions table on every request

## Decision
Sessions. At login the API generates a random token (`crypto.randomBytes(32)`), sends it in an httpOnly cookie, and stores only its SHA-256 hash in `sessions`, with a fixed expiry of 7 days. Logout deletes the row.

## Why
- Logout really works: deleting the row ends the session immediately. A JWT stays valid until it expires unless you add a blocklist or refresh tokens
- httpOnly cookies can't be read by JavaScript, so injected scripts can't steal the token
- JWT's main strength, verifying users across many services without a shared database, doesn't apply to one API and one database
- Hashing means a database leak doesn't hand out working sessions. SHA-256 (fast) is right here, unlike passwords: the token is 32 random bytes, so it can't be guessed however fast hashing is

The cost: a database lookup per request (by primary key, so fast), and cookie settings (SameSite) to protect against cross-site request forgery. SDK requests use API keys, not sessions.
