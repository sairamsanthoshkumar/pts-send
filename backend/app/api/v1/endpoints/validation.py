"""FS23/FS27 – SENDIG Validation"""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.security import get_current_user
from app.db.session import get_db
from app.schemas.study import TaskResponse

router = APIRouter()

class ValidateRequest(BaseModel):
    domain_codes: List[str]
    rule_sets: List[str] = ["SENDIG_3_1","FDA","BUSINESS"]

@router.post("/{study_id}/run", response_model=TaskResponse)
async def run_validation(study_id: uuid.UUID, body: ValidateRequest,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study: raise HTTPException(status_code=404, detail="Study not found")
    from app.workers.tasks import validate_domains_task
    task = validate_domains_task.delay(str(study_id), body.domain_codes, body.rule_sets, current_user.get("sub"))
    return TaskResponse(task_id=task.id, status="queued", message=f"Validation queued: {', '.join(body.domain_codes)}")

@router.get("/{study_id}/results")
async def get_validation_results(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from app.models.domain import ValidationIssue
    result = await db.execute(select(ValidationIssue).where(ValidationIssue.study_id == study_id)
                              .order_by(ValidationIssue.domain, ValidationIssue.row_number, ValidationIssue.id))
    issues = list(result.scalars().all())
    grouped = {}
    for issue in issues:
        key = (issue.rule_id, issue.severity, issue.domain, issue.variable, issue.message)
        grouped.setdefault(key, []).append(issue.row_number)
    results = [{"rule_id": key[0], "severity": key[1], "domain": key[2], "variable": key[3],
                "message": key[4], "row_numbers": [n for n in rows if n is not None]}
               for key, rows in grouped.items()]
    return {"study_id": str(study_id), "summary": {
        "errors": sum(issue.severity == "Error" for issue in issues),
        "warnings": sum(issue.severity == "Warning" for issue in issues),
        "info": sum(issue.severity == "Info" for issue in issues),
    }, "results": results}
