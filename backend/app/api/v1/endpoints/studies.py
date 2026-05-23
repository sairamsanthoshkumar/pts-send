import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.study import Study
from app.models.domain import AuditLog
from app.schemas.study import StudyCreate, StudyUpdate, StudyResponse

router = APIRouter()

@router.get("/", response_model=List[StudyResponse])
async def list_studies(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Study).order_by(Study.created_at.desc()))
    return result.scalars().all()

@router.post("/", response_model=StudyResponse, status_code=status.HTTP_201_CREATED)
async def create_study(body: StudyCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    study = Study(**body.model_dump(), created_by=current_user.get("sub"))
    db.add(study)
    db.add(AuditLog(study_id=study.id, user_id=current_user.get("sub"), action="CREATE_STUDY", resource_type="Study", resource_id=str(study.id), delta={"after": body.model_dump()}))
    await db.commit()
    await db.refresh(study)
    return study

@router.get("/{study_id}", response_model=StudyResponse)
async def get_study(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    return study

@router.patch("/{study_id}", response_model=StudyResponse)
async def update_study(study_id: uuid.UUID, body: StudyUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(study, field, value)
    await db.commit()
    await db.refresh(study)
    return study

@router.delete("/{study_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_study(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    await db.delete(study)
    await db.commit()
