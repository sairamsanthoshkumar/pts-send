CREATE TABLE IF NOT EXISTS validation_issues (
    id UUID PRIMARY KEY,
    study_id UUID NOT NULL REFERENCES studies(id),
    rule_id VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    domain VARCHAR(10) NOT NULL,
    variable VARCHAR(100),
    message TEXT NOT NULL,
    row_number INTEGER,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_validation_issues_study_id
    ON validation_issues (study_id);