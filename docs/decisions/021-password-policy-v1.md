# 021. Password policy for v1

## Context
NIST SP 800-63B-4 (2025) requires, for passwords used as the only login factor: at least 15 characters, accepting at least 64, no composition rules (no forced symbols, numbers or mixed case), and a check against common and breached passwords. Composition rules push people toward predictable patterns like `Password1!`.

## Options
- Follow NIST fully: 15 minimum plus a blocklist
- Minimum 8, no composition rules, no blocklist

## Decision
For v1: minimum 8 characters, a generous maximum (for example 128) so passphrases work, no composition rules, no blocklist. Passwords are hashed with Argon2id.

## Why
Keeps v1 simple. Dropping composition rules follows the guidance; the length minimum and blocklist are knowingly below it for password-only login. v2 raises the minimum to 15 and adds a common and breached password check.
