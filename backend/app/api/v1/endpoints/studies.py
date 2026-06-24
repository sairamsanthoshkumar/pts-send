"""FS8, FS14-FS16 — Studies, Groups, Animals"""
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.study import Study, StudyGroup, StudyAnimal
from app.models.domain import AuditLog
from app.schemas.study import (StudyCreate, StudyUpdate, StudyResponse,
    GroupCreate, GroupResponse, AnimalCreate, AnimalResponse, AuditReasonRequest)

router = APIRouter()

# ── Studies ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[StudyResponse])
async def list_studies(
    name: Optional[str] = Query(None, description="Wildcard search on study name (FS8.1.1)"),
    savante_status: Optional[str] = Query(None),
    connection_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)
):
    q = select(Study)
    if name:
        q = q.where(or_(Study.savante_study_name.ilike(f"%{name}%"), Study.protocol_number.ilike(f"%{name}%")))
    if savante_status:
        q = q.where(Study.savante_status == savante_status)
    if connection_type:
        q = q.where(Study.connection_type == connection_type)
    result = await db.execute(q.order_by(Study.created_at.desc()))
    return result.scalars().all()

@router.post("/", response_model=StudyResponse, status_code=status.HTTP_201_CREATED)
async def create_study(body: StudyCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    study = Study(**body.model_dump(), created_by=current_user.get("sub"))
    db.add(study)
    db.add(AuditLog(study_id=study.id, user_id=current_user.get("sub"), action="CREATE_STUDY",
                    resource_type="Study", resource_id=str(study.id), delta={"after": body.model_dump()}))
    await db.commit(); await db.refresh(study)
    return study

@router.get("/{study_id}", response_model=StudyResponse)
async def get_study(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    s = await db.get(Study, study_id)
    if not s: raise HTTPException(status_code=404, detail="Study not found")
    return s

@router.patch("/{study_id}", response_model=StudyResponse)
async def update_study(study_id: uuid.UUID, body: StudyUpdate,
    reason: Optional[str] = Query(None, description="Audit reason required when status=DataLoaded (FS14.2.1)"),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    s = await db.get(Study, study_id)
    if not s: raise HTTPException(status_code=404, detail="Study not found")
    before = {k: getattr(s, k) for k in body.model_fields_set}
    for k, v in body.model_dump(exclude_unset=True).items(): setattr(s, k, v)
    # FS14 — audit trail required when Data Loaded
    if s.savante_status in ("DataLoaded","Validated","Approved","Locked") and not reason:
        raise HTTPException(status_code=422, detail="Audit reason required for this study status (FS14.2.1)")
    db.add(AuditLog(study_id=study_id, user_id=current_user.get("sub"), action="UPDATE_STUDY",
                    resource_type="Study", resource_id=str(study_id), reason=reason,
                    delta={"before": before, "after": body.model_dump(exclude_unset=True)}))
    await db.commit(); await db.refresh(s)
    return s

@router.delete("/{study_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_study(study_id: uuid.UUID,
    reason: Optional[str] = Query(None, description="Required when deleting a loaded study (FS8.2.5)"),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    s = await db.get(Study, study_id)
    if not s: raise HTTPException(status_code=404, detail="Study not found")
    if s.savante_status in ("DataLoaded","Validated","Approved","Locked") and not reason:
        raise HTTPException(status_code=422, detail="Audit reason required to delete a loaded study (FS8.2.5)")
    db.add(AuditLog(study_id=None, user_id=current_user.get("sub"), action="DELETE_STUDY",
                    resource_type="Study", resource_id=str(study_id), reason=reason))
    await db.delete(s); await db.commit()

# ── Groups ────────────────────────────────────────────────────────────────────

@router.get("/{study_id}/groups", response_model=List[GroupResponse])
async def list_groups(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(StudyGroup).where(StudyGroup.study_id == study_id).order_by(StudyGroup.group_number))
    return result.scalars().all()

@router.post("/{study_id}/groups", response_model=GroupResponse, status_code=201)
async def create_group(study_id: uuid.UUID, body: GroupCreate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    g = StudyGroup(**body.model_dump(), study_id=study_id)
    db.add(g); await db.commit(); await db.refresh(g)
    return g

@router.patch("/{study_id}/groups/{group_id}", response_model=GroupResponse)
async def update_group(study_id: uuid.UUID, group_id: uuid.UUID, body: GroupCreate,
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    g = await db.get(StudyGroup, group_id)
    if not g: raise HTTPException(status_code=404, detail="Group not found")
    for k, v in body.model_dump(exclude_unset=True).items(): setattr(g, k, v)
    await db.commit(); await db.refresh(g)
    return g

# ── Animals ───────────────────────────────────────────────────────────────────

@router.get("/{study_id}/animals", response_model=List[AnimalResponse])
async def list_animals(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(StudyAnimal).where(StudyAnimal.study_id == study_id))
    return result.scalars().all()

@router.post("/{study_id}/animals", response_model=AnimalResponse, status_code=201)
async def create_animal(study_id: uuid.UUID, body: AnimalCreate, db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    study = await db.get(Study, study_id)
    if not study: raise HTTPException(status_code=404, detail="Study not found")
    # FS14.1.9 — USUBJID computation
    usubjid = body.subject_id if study.unique_subject_id_flag else f"{study.protocol_number}-{body.subject_id}"
    animal = StudyAnimal(**body.model_dump(), study_id=study_id, usubjid=usubjid)
    db.add(animal); await db.commit(); await db.refresh(animal)
    return animal
