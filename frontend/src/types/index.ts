export interface Study {
  id: string; name: string; protocol_number: string; species?: string;
  study_type?: string; sendig_version: string;
  status: 'Draft'|'InProgress'|'Validated'|'Locked'; description?: string;
  created_by?: string; created_at: string; updated_at: string;
}
export interface Domain {
  id: string; study_id: string; domain_code: string; record_count: number;
  status: 'Pending'|'Processing'|'Generated'|'Validated'|'Failed';
  xpt_storage_path?: string; error_message?: string; generated_at?: string; created_at: string;
}
export interface ValidationIssue {
  rule_id: string; severity: 'Error'|'Warning'|'Info'; domain: string;
  variable: string; message: string; row_numbers: number[];
}
export interface AuditEntry {
  id: string; user_id: string; action: string; resource_type: string;
  resource_id: string; delta?: Record<string, unknown>; timestamp: string;
}
export interface User { email: string; name: string; role: string; }
