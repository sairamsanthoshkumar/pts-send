"""FS8, FS14-FS16 — Studies, Groups, Animals"""
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.study import Study, StudyGroup, StudyAnimal
from app.models.domain import AuditLog
from app.schemas.study import (LoadStudyRequest, StudyCreate, StudyUpdate, StudyResponse,
    GroupCreate, GroupResponse, AnimalCreate, AnimalResponse, AuditReasonRequest)

router = APIRouter()

def _is_replaced_group(name: str | None) -> bool:
    configured = {value.strip().casefold() for value in settings.REPLACED_ANIMAL_GROUP_NAMES.split(",") if value.strip()}
    normalized = (name or "").strip().casefold()
    return any(value in normalized for value in configured)

AGE_UNIT_DAYS = {"DAY": 1, "DAYS": 1, "WEEK": 7, "WEEKS": 7, "MONTH": 30, "MONTHS": 30,
                 "YEAR": 365, "YEARS": 365}

def _parse_date(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None

def _contains_leap_day(start: datetime, end: datetime) -> bool:
    for year in range(start.year, end.year + 1):
        if (year % 4 == 0 and year % 100 != 0) or year % 400 == 0:
            leap_day = datetime(year, 2, 29, tzinfo=start.tzinfo)
            if start <= leap_day <= end:
                return True
    return False

def _calculate_age(body: AnimalCreate) -> float | None:
    if not body.rfstdtc or not body.brthdtc or not body.age_units:
        return body.age
    start = _parse_date(body.rfstdtc)
    birth = _parse_date(body.brthdtc)
    if not start or not birth or start < birth:
        return body.age
    days = (start - birth).total_seconds() / 86400
    units = body.age_units.strip().upper()
    if units in {"DAY", "DAYS"}:
        return days
    if units in {"WEEK", "WEEKS"}:
        return days / 7
    if units in {"YEAR", "YEARS"}:
        return days / (366 if _contains_leap_day(birth, start) else 365)
    return body.age

def _calculate_birth_date(body: AnimalCreate) -> str | None:
    if body.age_reference_date and settings.BIRTHDTC == "1":
        return body.age_reference_date
    if settings.BIRTHDTC != "0" or body.reference_age is None or not body.reference_age_unit or not body.age_reference_date or not body.age_reference_significance:
        return body.brthdtc
    days_per_unit = AGE_UNIT_DAYS.get(body.reference_age_unit.strip().upper())
    if days_per_unit is None:
        return body.brthdtc
    try:
        reference_date = datetime.fromisoformat(body.age_reference_date.replace("Z", "+00:00"))
    except ValueError:
        return body.brthdtc
    return (reference_date - timedelta(days=body.reference_age * days_per_unit)).date().isoformat()

# ── Studies ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[StudyResponse])
async def list_studies(
    name: Optional[str] = Query(None, description="Wildcard search on study name (FS8.1.1)"),
    study_status: Optional[str] = Query(None),
    connection_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)
):
    q = select(Study)
    if name:
        q = q.where(or_(Study.pts_study_name.ilike(f"%{name}%"), Study.protocol_number.ilike(f"%{name}%")))
    if study_status:
        q = q.where(Study.study_status == study_status)
    if connection_type:
        q = q.where(Study.connection_type == connection_type)
    result = await db.execute(q.order_by(Study.created_at.desc()))
    return result.scalars().all()

@router.post("/load-from-connector", response_model=StudyResponse, status_code=status.HTTP_201_CREATED,
             summary="Load next new study folder from connector path")
async def load_study_from_connector(
    body: LoadStudyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if not body.connector_url:
        raise HTTPException(status_code=422, detail="Connector URL is required to load new studies.")
    if body.connector_type not in ("CSV", "SEND_DATASET", "OPENVMS"):
        raise HTTPException(status_code=422, detail=f"Connector type {body.connector_type} does not support folder discovery.")

    connector_path = Path(body.connector_url)
    if not connector_path.exists() or not connector_path.is_dir():
        raise HTTPException(status_code=422, detail="Connector folder path not found or not accessible.")

    available_folders = sorted([p.name for p in connector_path.iterdir() if p.is_dir()])
    if not available_folders:
        raise HTTPException(status_code=404, detail="No study folders found in connector path.")

    loaded_names = {name for name in body.loaded_study_names if name}
    next_folder = next((folder for folder in available_folders if folder not in loaded_names), None)
    if not next_folder:
        raise HTTPException(status_code=404, detail="No new study available to load")

    protocol_number = next_folder
    existing = await db.execute(select(Study).where(Study.protocol_number == protocol_number))
    if existing.scalars().first():
        protocol_number = f"{next_folder}-{uuid.uuid4().hex[:8]}"

    study = Study(
        pts_study_name=next_folder,
        protocol_number=protocol_number,
        import_study_name=next_folder,
        connection_type=body.connector_type,
        created_by=current_user.get("sub"),
    )
    db.add(study)
    db.add(AuditLog(study_id=study.id, user_id=current_user.get("sub"), action="CREATE_STUDY",
                    resource_type="Study", resource_id=str(study.id), delta={"after": {"pts_study_name": next_folder, "protocol_number": protocol_number}}))
    await db.commit()
    await db.refresh(study)
    return study

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
    if s.study_status in ("DataLoaded","Validated","Approved","Locked") and not reason:
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
    if s.study_status in ("DataLoaded","Validated","Approved","Locked") and not reason:
        raise HTTPException(status_code=422, detail="Audit reason required to delete a loaded study (FS8.2.5)")
    db.add(AuditLog(study_id=None, user_id=current_user.get("sub"), action="DELETE_STUDY",
                    resource_type="Study", resource_id=str(study_id), reason=reason))
    await db.delete(s); await db.commit()

# ── Groups ────────────────────────────────────────────────────────────────────

@router.get("/{study_id}/groups", response_model=List[GroupResponse])
async def list_groups(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(StudyGroup).where(StudyGroup.study_id == study_id).order_by(StudyGroup.group_number))
    return [group for group in result.scalars().all() if not _is_replaced_group(group.male_group_name or group.female_group_name or group.male_group_label or group.female_group_label)]

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
    groups = await db.execute(select(StudyGroup).where(StudyGroup.study_id == study_id))
    replaced_ids = {group.id for group in groups.scalars().all()
                    if _is_replaced_group(group.male_group_name or group.female_group_name or group.male_group_label or group.female_group_label)}
    return [animal for animal in result.scalars().all() if animal.group_id not in replaced_ids]

@router.post("/{study_id}/animals", response_model=AnimalResponse, status_code=201)
async def create_animal(study_id: uuid.UUID, body: AnimalCreate, db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    study = await db.get(Study, study_id)
    if not study: raise HTTPException(status_code=404, detail="Study not found")
    # FS14.1.9 — USUBJID computation
    usubjid = body.subject_id if study.unique_subject_id_flag else f"{study.protocol_number}-{body.subject_id}"
    animal_data = body.model_dump()
    animal_data["brthdtc"] = _calculate_birth_date(body)
    body_for_age = body.model_copy(update={"brthdtc": animal_data["brthdtc"]})
    animal_data["age"] = _calculate_age(body_for_age)
    animal = StudyAnimal(**animal_data, study_id=study_id, usubjid=usubjid)
    db.add(animal); await db.commit(); await db.refresh(animal)
    return animal
