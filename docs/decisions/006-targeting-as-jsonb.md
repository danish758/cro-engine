# 006. Targeting is stored as JSONB, AND only in v1

## Context
Targeting rules match context keys against values. The assignment engine evaluates a list of rules joined with AND, and supports "is one of" for several values of one key.

## Decision
Store targeting as JSONB on the experiment, in the same shape the assignment engine uses. v1 supports AND plus "is one of". OR across different keys is v2.

## Why
Rows would work for a flat AND list, but turning them into a nested AND/OR tree later is painful. JSONB can grow into that shape without a schema change. GrowthBook also defaults to AND, with OR as an advanced option.
