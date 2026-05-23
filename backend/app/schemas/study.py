import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

class StudyCreate(BaseModel):
    name: str
    protocol_number: str
    species: Optional[str] = None
    study_type: Optional[str] = None
    sendig_version: str = "3.1"
    description: Optional[str] = None

class StudyUpdate(BaseModel):
    name: Optional[str] = None
    species: Optional[str] = None
    study_type: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class StudyResponse(BaseModel):
    id: uuid.UUID
    name: str
    protocol_number: str
    species: Optional[str]
    study_type: Optional[str]
    sendig_version: str
    status: str
    description: Optional[str]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class TaskResponse(BaseModel):
    task_id: str
    status: str
    message: str
