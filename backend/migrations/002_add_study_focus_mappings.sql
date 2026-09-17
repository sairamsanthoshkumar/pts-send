CREATE TABLE IF NOT EXISTS study_focus_mappings (
    id UUID PRIMARY KEY,
    study_id UUID NOT NULL REFERENCES studies(id),
    domain_code VARCHAR(10) NOT NULL,
    source_value VARCHAR(500) NOT NULL,
    focid VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_study_focus_mappings_study_id
    ON study_focus_mappings (study_id);