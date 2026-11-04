CREATE TABLE users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_unique ON users(lower(email));

CREATE TABLE projects (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE membership_role AS ENUM ('admin', 'member');

CREATE TABLE memberships (
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role membership_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, project_id)
);

CREATE INDEX memberships_project_id_idx ON memberships(project_id);

CREATE TABLE environments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, project_id)
);

CREATE UNIQUE INDEX environments_name_project_id_idx ON environments(project_id, lower(name));

CREATE TABLE api_keys (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    environment_id bigint NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX one_active_key_per_environment
  ON api_keys (environment_id)
  WHERE revoked_at IS NULL;

CREATE TABLE folders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (id, project_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX folders_name_project_id_idx ON folders(project_id, lower(name));

CREATE UNIQUE INDEX folders_default_project_id_idx ON folders(project_id) WHERE is_default = TRUE;

CREATE TYPE context_key_type AS ENUM ('string', 'number', 'boolean');

CREATE TABLE context_keys (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    UNIQUE (project_id,key),
    type context_key_type NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE experiment_status AS ENUM ('draft', 'running', 'stopped');

CREATE TABLE experiments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    environment_id bigint NOT NULL,
    folder_id bigint NOT NULL ,
    key TEXT NOT NULL CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),   
    name TEXT NOT NULL,
    description TEXT,
    status experiment_status NOT NULL DEFAULT 'draft',
    targeting JSONB NOT NULL DEFAULT '[]',
    seed integer NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (environment_id, key),
    FOREIGN KEY (environment_id, project_id)
        REFERENCES environments (id, project_id)
        ON DELETE NO ACTION,
    FOREIGN KEY (folder_id, project_id)
        REFERENCES folders (id, project_id)
        ON DELETE NO ACTION
);

CREATE INDEX experiments_folder_id_idx ON experiments (folder_id);
CREATE INDEX experiments_project_id_idx ON experiments (project_id);

CREATE TABLE variants (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    experiment_id bigint NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    UNIQUE (experiment_id, key),
    name TEXT NOT NULL,
    is_control BOOLEAN NOT NULL DEFAULT FALSE,
    weight integer NOT NULL CHECK (weight between 0 and 100),
    position integer NOT NULL,
    UNIQUE (experiment_id, position),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_control_per_experiment
  ON variants (experiment_id)
  WHERE is_control;


CREATE TYPE log_action AS ENUM ('create', 'update', 'delete');

CREATE TYPE log_entity AS ENUM (
 'project', 'membership',
  'environment', 'api_key', 'folder', 
  'context_key', 'experiment', 'variant');

CREATE TABLE audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint REFERENCES users(id) ON DELETE SET NULL,
    project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    action log_action NOT NULL,
    entity_type log_entity NOT NULL,
    entity_id bigint NOT NULL,
    before JSONB,
    after JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_project_id_created_at_idx ON audit_logs (project_id, created_at);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);