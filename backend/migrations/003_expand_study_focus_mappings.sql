ALTER TABLE study_focus_mappings ADD COLUMN IF NOT EXISTS fixed_type VARCHAR(30) NOT NULL DEFAULT 'Dosing';
ALTER TABLE study_focus_mappings ADD COLUMN IF NOT EXISTS category VARCHAR(500);
ALTER TABLE study_focus_mappings ADD COLUMN IF NOT EXISTS subcategory VARCHAR(500);
ALTER TABLE study_focus_mappings ADD COLUMN IF NOT EXISTS tissue_flag VARCHAR(30);
ALTER TABLE study_focus_mappings ADD COLUMN IF NOT EXISTS locator VARCHAR(500);