import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.db.session import get_db
from app.schemas.study import TaskResponse

router = APIRouter()

class TransformRequest(BaseModel):
    domain_codes: List[str]

@router.post("/{study_id}/run", response_model=TaskResponse)
async def run_transformation(study_id: uuid.UUID, body: TransformRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    from app.workers.tasks import transform_domains_task
    task = transform_domains_task.delay(str(study_id), body.domain_codes, current_user.get("sub"))
    return TaskResponse(task_id=task.id, status="queued", message=f"Transformation queued for: {', '.join(body.domain_codes)}")

@router.get("/{study_id}/domains")
async def list_domains(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy import select
    from app.models.domain import Domain
    result = await db.execute(select(Domain).where(Domain.study_id == study_id))
    return [{"id": str(d.id), "domain_code": d.domain_code, "record_count": d.record_count, "status": d.status} for d in result.scalars().all()]
