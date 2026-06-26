export interface Study {
  id: string; pts_study_name: string; protocol_number: string;
  import_study_name?: string; protocol_status?: string;
  study_status: 'Setup'|'DataLoaded'|'Validated'|'Approved'|'Locked';
  dataset_approved: boolean; dataset_approved_by?: string;
  dataset_approved_comment?: string; dataset_approved_date?: string;
  unique_subject_id_flag: boolean; species?: string; study_type?: string;
  sendig_version: string; connection_type: string; description?: string;
  created_by?: string; created_at: string; updated_at: string;
}
export interface StudyGroup {
  id: string; study_id: string; group_number: string; control_type?: string;
  male_group_label?: string; female_group_label?: string; compound?: string;
  route?: string; num_males: number; num_females: number;
}
export interface CTMapping {
  id: string; domain_code: string; variable_name: string; source_value: string;
  ct_value?: string; ct_codelist?: string; mapped: boolean;
  status: 'Unmapped'|'Mapped'|'Suppressed';
}
export interface Domain {
  id: string; study_id: string; domain_code: string; domain_label?: string;
  record_count: number; status: 'Pending'|'Processing'|'Generated'|'Validated'|'Failed';
  validation_errors: number; validation_warnings: number; generated_at?: string;
}
export interface AuditEntry {
  id: string; user_id: string; action: string; resource_type: string;
  resource_id: string; reason?: string; timestamp: string;
}
export interface User { email: string; name: string; role: string; }
