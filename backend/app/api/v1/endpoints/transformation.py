"""FS22/FS23/FS27 – SEND Output Transformation"""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.db.session import get_db
from app.schemas.study import TaskResponse

router = APIRouter()

SEND_DOMAINS = ["TS","TE","SE","TA","TX","DM","BW","MI","SC","DS","DD","MA","TF","BG","OM","CL","FW","PM","LB","EX","VS","EG","RE","CV","IC","FM","PY","FX","DP"]

class TransformRequest(BaseModel):
    domain_codes: List[str]
    output_format: str = "XPT"  # XPT | CSV | XML  (FS23)
    sendig_version: str = "3.1"

@router.get("/domains", summary="FS27 – Full list of SEND domains")
async def list_send_domains(_=Depends(get_current_user)):
    domain_labels = {
        "TS":"Trial Summary","TE":"Trial Elements","SE":"Subject Elements","TA":"Trial Arms",
        "TX":"Trial Sets","DM":"Demographics","BW":"Body Weights","MI":"Microscopic Findings",
        "SC":"Subject Characteristics","DS":"Disposition","DD":"Death Diagnosis",
        "MA":"Macroscopic Findings","TF":"Tumor Findings","BG":"Body Weight Gains",
        "OM":"Organ Measurements","CL":"Clinical Observations","FW":"Food/Water Consumption",
        "PM":"Palpable Masses","LB":"Laboratory Results","EX":"Exposure","VS":"Vital Signs",
        "EG":"ECG Results","RE":"Respiratory Results","CV":"Cardiovascular Results",
        "IC":"Implantation Classification","FM":"Fetal Measurements","PY":"Nonclinical Pregnancy",
        "FX":"Fetal Pathology","DP":"Developmental Milestone",
    }
    return [{"code": c, "label": domain_labels.get(c, c)} for c in SEND_DOMAINS]

@router.post("/{study_id}/run", response_model=TaskResponse, summary="FS23 – Generate SEND domains")
async def run_transformation(study_id: uuid.UUID, body: TransformRequest,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study: raise HTTPException(status_code=404, detail="Study not found")
    from app.workers.tasks import transform_domains_task
    task = transform_domains_task.delay(str(study_id), body.domain_codes, body.output_format, current_user.get("sub"))
    return TaskResponse(task_id=task.id, status="queued", message=f"Transformation queued: {', '.join(body.domain_codes)} → {body.output_format}")

@router.get("/{study_id}/domains")
async def list_study_domains(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy import select
    from app.models.domain import Domain
    result = await db.execute(select(Domain).where(Domain.study_id == study_id).order_by(Domain.domain_code))
    return [{"id":str(d.id),"domain_code":d.domain_code,"domain_label":d.domain_label,"record_count":d.record_count,"status":d.status,"validation_errors":d.validation_errors,"validation_warnings":d.validation_warnings,"generated_at":d.generated_at} for d in result.scalars().all()]
