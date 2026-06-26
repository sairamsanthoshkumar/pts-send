import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

# ─── Study ───────────────────────────────────────────────────────────────────
class StudyCreate(BaseModel):
    pts_study_name: str
    protocol_number: str
    import_study_name: Optional[str] = None
    species: Optional[str] = None
    study_type: Optional[str] = None
    sendig_version: str = "3.1"
    connection_type: str = "CSV"
    description: Optional[str] = None
    unique_subject_id_flag: bool = False

class StudyUpdate(BaseModel):
    pts_study_name: Optional[str] = None
    species: Optional[str] = None
    study_type: Optional[str] = None
    description: Optional[str] = None
    study_status: Optional[str] = None
    protocol_status: Optional[str] = None
    dataset_approved: Optional[bool] = None
    dataset_approved_comment: Optional[str] = None
    unique_subject_id_flag: Optional[bool] = None

class StudyResponse(BaseModel):
    id: uuid.UUID
    pts_study_name: str
    protocol_number: str
    import_study_name: Optional[str]
    protocol_status: Optional[str]
    study_status: str
    dataset_approved: bool
    dataset_approved_by: Optional[str]
    dataset_approved_comment: Optional[str]
    dataset_approved_date: Optional[datetime]
    unique_subject_id_flag: bool
    species: Optional[str]
    study_type: Optional[str]
    sendig_version: str
    connection_type: str
    description: Optional[str]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

# ─── Group ────────────────────────────────────────────────────────────────────
class GroupCreate(BaseModel):
    group_number: str
    control_type: Optional[str] = None
    male_group_label: Optional[str] = None
    female_group_label: Optional[str] = None
    compound: Optional[str] = None
    route: Optional[str] = None
    num_males: int = 0
    num_females: int = 0

class GroupResponse(BaseModel):
    id: uuid.UUID
    study_id: uuid.UUID
    group_number: str
    control_type: Optional[str]
    male_group_label: Optional[str]
    female_group_label: Optional[str]
    male_group_name: Optional[str]
    female_group_name: Optional[str]
    compound: Optional[str]
    route: Optional[str]
    num_males: int
    num_females: int
    group_type: Optional[int]
    model_config = {"from_attributes": True}

# ─── Animal ───────────────────────────────────────────────────────────────────
class AnimalCreate(BaseModel):
    subject_id: str
    sex: Optional[str] = None
    species: Optional[str] = None
    strain: Optional[str] = None
    rfstdtc: Optional[str] = None
    rfendtc: Optional[str] = None
    armcd: Optional[str] = None
    arm: Optional[str] = None
    setcd: Optional[str] = None
    group_id: Optional[uuid.UUID] = None

class AnimalResponse(BaseModel):
    id: uuid.UUID
    study_id: uuid.UUID
    subject_id: str
    usubjid: Optional[str]
    sex: Optional[str]
    species: Optional[str]
    strain: Optional[str]
    rfstdtc: Optional[str]
    rfendtc: Optional[str]
    armcd: Optional[str]
    arm: Optional[str]
    setcd: Optional[str]
    died: bool
    model_config = {"from_attributes": True}

# ─── CT Mapping ───────────────────────────────────────────────────────────────
class CTMappingUpdate(BaseModel):
    ct_value: Optional[str] = None
    ct_codelist: Optional[str] = None
    status: Optional[str] = None  # Mapped | Unmapped | Suppressed

class CTMappingResponse(BaseModel):
    id: uuid.UUID
    domain_code: str
    variable_name: str
    source_value: str
    ct_value: Optional[str]
    ct_codelist: Optional[str]
    mapped: bool
    status: str
    model_config = {"from_attributes": True}

# ─── Output Mapping ───────────────────────────────────────────────────────────
class OutputMappingCreate(BaseModel):
    domain_code: str
    send_variable: str
    source_field: Optional[str] = None
    transform_rule: Optional[str] = None
    is_required: bool = False

class OutputMappingResponse(BaseModel):
    id: uuid.UUID
    domain_code: str
    send_variable: str
    source_field: Optional[str]
    transform_rule: Optional[str]
    is_required: bool
    model_config = {"from_attributes": True}

# ─── Shared ───────────────────────────────────────────────────────────────────
class TaskResponse(BaseModel):
    task_id: str
    status: str
    message: str

class ValidationIssue(BaseModel):
    rule_id: str
    severity: str
    domain: str
    variable: Optional[str]
    message: str
    row_numbers: List[int] = []

class AuditReasonRequest(BaseModel):
    reason: str
    comment: Optional[str] = None
