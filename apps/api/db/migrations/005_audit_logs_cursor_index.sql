DROP INDEX audit_logs_project_id_created_at_idx;
CREATE INDEX audit_logs_project_id_id_idx ON audit_logs (project_id, id);