import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.db.session import get_db
from app.schemas.study import TaskResponse

router = APIRouter()

class PackageRequest(BaseModel):
    include_define_xml: bool = True
    include_sdrg: bool = True
    include_xpt: bool = True

@router.post("/{study_id}/package", response_model=TaskResponse)
async def generate_submission_package(study_id: uuid.UUID, body: PackageRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    from app.workers.tasks import generate_package_task
    task = generate_package_task.delay(str(study_id), body.model_dump(), current_user.get("sub"))
    return TaskResponse(task_id=task.id, status="queued", message="Submission package generation queued")

@router.get("/{study_id}/audit-trail")
async def get_audit_trail(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy import select
    from app.models.domain import AuditLog
    result = await db.execute(select(AuditLog).where(AuditLog.study_id == study_id).order_by(AuditLog.timestamp.desc()))
    return [{"id": str(l.id), "user_id": l.user_id, "action": l.action, "resource_type": l.resource_type, "timestamp": l.timestamp.isoformat()} for l in result.scalars().all()]
