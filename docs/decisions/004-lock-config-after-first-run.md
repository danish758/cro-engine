# 004. Lock variants, weights and targeting after the first run

## Context
Assignment is deterministic. Changing weights, variant order or targeting on an experiment that has run silently moves visitors between variants and mixes results.

## Options
- Lock only while running, unlock when stopped
- Lock after the first run, even when stopped
- Allow edits but start a new phase (GrowthBook style)

## Decision
Lock after the first run. To change the config, duplicate the experiment with a new key. Phases are planned for v2.

## Why
Unlocking when stopped lets a stop, edit, restart cycle corrupt results. Phases only matter once results are measured, which is v2.
