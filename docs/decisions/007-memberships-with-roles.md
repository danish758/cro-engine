# 007. Users and projects connect through memberships

## Context
A user can be in many projects, a project has many users, and a user's role differs per project.

## Decision
A memberships table with user_id, project_id and role (admin or member). Access to everything inside a project is checked through memberships, not through user_id columns on other tables.

## Why
The role describes the connection, not the user or the project. One access path means one place to check permissions.
