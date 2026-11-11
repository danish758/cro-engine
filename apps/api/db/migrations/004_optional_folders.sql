ALTER TABLE experiments ALTER COLUMN folder_id DROP NOT NULL;
ALTER TABLE experiments DROP CONSTRAINT experiments_folder_id_project_id_fkey;
ALTER TABLE experiments
    ADD CONSTRAINT experiments_folder_id_project_id_fkey
    FOREIGN KEY (folder_id, project_id)
    REFERENCES folders (id, project_id)
    ON DELETE SET NULL (folder_id);
ALTER TABLE folders DROP COLUMN is_default;