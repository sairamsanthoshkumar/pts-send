import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.db.session import get_db
from app.schemas.study import TaskResponse

router = APIRouter()

class ValidateRequest(BaseModel):
    domain_codes: List[str]
    rule_sets: List[str] = ["SENDIG_3_1", "FDA"]

@router.post("/{study_id}/run", response_model=TaskResponse)
async def run_validation(study_id: uuid.UUID, body: ValidateRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    from app.workers.tasks import validate_domains_task
    task = validate_domains_task.delay(str(study_id), body.domain_codes, body.rule_sets, current_user.get("sub"))
    return TaskResponse(task_id=task.id, status="queued", message=f"Validation queued for: {', '.join(body.domain_codes)}")

@router.get("/{study_id}/results")
async def get_validation_results(study_id: uuid.UUID, _=Depends(get_current_user)):
    return {"study_id": str(study_id), "summary": {"errors": 0, "warnings": 2, "info": 5}, "results": [{"rule_id": "SEND3.1-DM-001", "severity": "Warning", "domain": "DM", "variable": "DMDTC", "message": "2 records have DMDTC after RFSTDTC", "row_numbers": [12, 45]}]}
