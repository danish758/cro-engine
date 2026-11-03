# Spec

## v1 features

**Accounts**
- Sign up, log in, log out

**Projects and roles**
- Create, edit and delete a project
- Two roles: admin and member
- Admins manage project settings, environments, API keys and members
- Members manage experiments, folders and context keys
- A project always has at least one admin

**Environments**
- Staging and production are created by default with each project
- Admins can create custom environments
- Environment names are unique within a project, ignoring case

**Folders**
- Create, rename and delete folders (one level, no nesting)
- A default folder ("General") is created with each project; it can be renamed but not deleted
- Folder names are unique within a project, ignoring case
- An experiment can be moved to another folder at any time

**Context keys**
- Keys used in targeting, each with a type: string, number or boolean
- Key names are lowercase letters, numbers and underscores, unique within a project, and can't be renamed
- A key's type can't change, and the key can't be deleted, while experiments use it

**Experiments**
- Create, edit, duplicate and archive
- Each experiment belongs to one environment and one folder
- Variants: exactly one control, at least two variants in total, with weights
- Targeting: a list of rules joined with AND; a rule can match one of several values for one key
- Status: draft, running, stopped

**Audit log**
- Every create, update and delete inside a project is recorded: who, what, when, from what to what

**API keys and config endpoint**
- One public, read-only API key per environment, with regenerate
- An endpoint the SDK calls to get the running experiments of an environment

## v1 rules

**Experiments**
- The key is unique per environment and never changes
- Keys are lowercase letters and numbers separated by single hyphens, e.g. `checkout-v2`
- The same key can exist in different environments
- Duplicating within an environment needs a new key; duplicating to another environment can keep it
- A duplicate copies title, targeting, variants and weights, and starts as draft

**Status**
- Draft only at creation; an experiment never returns to draft
- Running and stopped can switch back and forth
- A running experiment can't be archived

**Locking**
- Variants, weights and targeting are locked after the first run, even when stopped
- To change them, duplicate the experiment with a new key

**Variants**
- A position column fixes their order; always read with ORDER BY position
- Weights must sum to 100 (checked in app code, in the same transaction as the save)

**Targeting**
- Stored as JSONB in the assignment engine's shape
- Rule values are checked against the context key's type when saved

**Deleting**
- Experiments are archived
- API keys are revoked, and the row is kept
- Projects are deleted with everything in them, by admins only
- Context keys can't be deleted while experiments use them
- An environment can't be deleted while it has experiments, including archived ones; its API keys are deleted with it
- A folder can't be deleted while it has active experiments; its archived experiments are moved to the default folder first

**API key access**
- Public and always visible, since it's embedded in website code
- Returns only running experiments in its environment, and only the fields the SDK needs: key, status, variants, targeting, seed

**Access**
- Users see only projects they're a member of

## v2

- Members, invites and password reset (all need email)
- Event tracking and results with the stats engine
- Conversion events: reusable per project, one primary and any number of secondary per experiment
- Phases: changing a stopped experiment starts a new phase
- Coverage: include only a percentage of eligible visitors
- OR across different targeting keys
- Targeting groups: reusable, locked while a running experiment uses them, not deletable while used
- Feature flags
- Secret API keys: stored hashed, shown once
