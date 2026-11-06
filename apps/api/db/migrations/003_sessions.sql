CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL 
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);

GRANT SELECT, INSERT, DELETE ON sessions TO app_user;