"""FS23/FS29/FS32/FS43 – Reports, Define.xml, Audit Trail"""
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
    output_format: str = "XPT"   # XPT | CSV | XML

@router.post("/{study_id}/package", response_model=TaskResponse, summary="FS23/FS29 – Generate submission package")
async def generate_submission_package(study_id: uuid.UUID, body: PackageRequest,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study: raise HTTPException(status_code=404, detail="Study not found")
    from app.workers.tasks import generate_package_task
    task = generate_package_task.delay(str(study_id), body.model_dump(), current_user.get("sub"))
    return TaskResponse(task_id=task.id, status="queued", message="Submission package generation queued")

@router.get("/{study_id}/audit-trail", summary="FS32 – 21 CFR Part 11 Audit Trail")
async def get_audit_trail(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy import select
    from app.models.domain import AuditLog
    result = await db.execute(select(AuditLog).where(AuditLog.study_id == study_id).order_by(AuditLog.timestamp.desc()))
    return [{"id":str(l.id),"user_id":l.user_id,"action":l.action,"resource_type":l.resource_type,
             "resource_id":l.resource_id,"reason":l.reason,"delta":l.delta,"timestamp":l.timestamp.isoformat()} for l in result.scalars().all()]

@router.get("/{study_id}/define-xml", summary="FS29 – Get Define.xml preview")
async def get_define_xml(study_id: uuid.UUID, _=Depends(get_current_user)):
    return {"study_id":str(study_id),"status":"pending","message":"Run /package first to generate Define.xml"}

@router.post("/{study_id}/approve", summary="FS8.2.7/FS14.1.5 – Approve dataset")
async def approve_dataset(study_id: uuid.UUID, comment: str = "",
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    from datetime import datetime, timezone
    study = await db.get(Study, study_id)
    if not study: raise HTTPException(status_code=404, detail="Study not found")
    if study.protocol_status not in ("Closed","Archived",None):
        raise HTTPException(status_code=422, detail="Dataset approval only allowed for Closed or Archived studies (FS8.2.7)")
    study.dataset_approved = True
    study.dataset_approved_by = current_user.get("sub")
    study.dataset_approved_comment = comment
    study.dataset_approved_date = datetime.now(timezone.utc)
    study.study_status = "Approved"
    from app.models.domain import AuditLog
    db.add(AuditLog(study_id=study_id, user_id=current_user.get("sub"), action="APPROVE_DATASET",
                    resource_type="Study", resource_id=str(study_id), reason=comment))
    await db.commit(); await db.refresh(study)
    return {"message":"Dataset approved","approved_by":current_user.get("sub")}
