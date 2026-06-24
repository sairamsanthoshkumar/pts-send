"""FS24/FS25 – Controlled Terminology"""
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.domain import CTMapping
from app.schemas.study import CTMappingUpdate, CTMappingResponse

router = APIRouter()

# CDISC SEND controlled terminology codelists (subset per FS25)
SEND_CT = {
    "SEX":      [{"code":"M","label":"Male"},{"code":"F","label":"Female"},{"code":"U","label":"Unknown"}],
    "SPECIES":  [{"code":"RAT","label":"Rat"},{"code":"MOUSE","label":"Mouse"},{"code":"DOG","label":"Dog"},{"code":"RABBIT","label":"Rabbit"},{"code":"MONKEY","label":"Monkey"},{"code":"PIG","label":"Pig"}],
    "STRAIN":   [{"code":"SPRAGUE-DAWLEY","label":"Sprague-Dawley"},{"code":"WISTAR","label":"Wistar"},{"code":"CD-1","label":"CD-1"},{"code":"C57BL/6","label":"C57BL/6"}],
    "ROUTE":    [{"code":"ORAL","label":"Oral"},{"code":"INTRAVENOUS","label":"Intravenous"},{"code":"SUBCUTANEOUS","label":"Subcutaneous"},{"code":"INTRAPERITONEAL","label":"Intraperitoneal"},{"code":"TOPICAL","label":"Topical"},{"code":"INHALATION","label":"Inhalation"}],
    "SEVERITY": [{"code":"MINIMAL","label":"Minimal"},{"code":"MILD","label":"Mild"},{"code":"MODERATE","label":"Moderate"},{"code":"MARKED","label":"Marked"},{"code":"SEVERE","label":"Severe"}],
    "INCIDCD":  [{"code":"Y","label":"Yes"},{"code":"N","label":"No"}],
    "UNIT_BW":  [{"code":"g","label":"grams"},{"code":"kg","label":"kilograms"}],
    "UNIT_LB":  [{"code":"g/dL","label":"g/dL"},{"code":"mg/dL","label":"mg/dL"},{"code":"mmol/L","label":"mmol/L"},{"code":"U/L","label":"U/L"},{"code":"10^9/L","label":"10^9/L"}],
    "ARMCD":    [{"code":"HD","label":"High Dose"},{"code":"MD","label":"Mid Dose"},{"code":"LD","label":"Low Dose"},{"code":"VHD","label":"Very High Dose"},{"code":"CONTROL","label":"Control"},{"code":"SAT","label":"Satellite"}],
}

@router.get("/codelists", summary="FS25 – Available CT codelists")
async def get_codelists(_=Depends(get_current_user)):
    return [{"codelist": k, "terms": v} for k, v in SEND_CT.items()]

@router.get("/codelists/{codelist}", summary="FS25 – Terms for a specific codelist")
async def get_codelist_terms(codelist: str, _=Depends(get_current_user)):
    terms = SEND_CT.get(codelist.upper())
    if not terms: raise HTTPException(status_code=404, detail=f"Codelist '{codelist}' not found")
    return {"codelist": codelist.upper(), "terms": terms}

@router.get("/mappings", response_model=List[CTMappingResponse], summary="FS25 – List unmapped/mapped CT terms")
async def list_ct_mappings(
    study_id: Optional[uuid.UUID] = Query(None),
    domain_code: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)
):
    q = select(CTMapping)
    if study_id: q = q.where(CTMapping.study_id == study_id)
    if domain_code: q = q.where(CTMapping.domain_code == domain_code)
    if status: q = q.where(CTMapping.status == status)
    result = await db.execute(q.order_by(CTMapping.domain_code, CTMapping.variable_name))
    return result.scalars().all()

@router.patch("/mappings/{mapping_id}", response_model=CTMappingResponse, summary="FS25 – Update a CT mapping")
async def update_ct_mapping(mapping_id: uuid.UUID, body: CTMappingUpdate,
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    m = await db.get(CTMapping, mapping_id)
    if not m: raise HTTPException(status_code=404, detail="Mapping not found")
    for k, v in body.model_dump(exclude_unset=True).items(): setattr(m, k, v)
    if body.ct_value: m.mapped = True
    await db.commit(); await db.refresh(m)
    return m

@router.post("/mappings/bulk-map", summary="FS25 – Bulk map source values to CT")
async def bulk_map_ct(
    domain_code: str, variable_name: str, study_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)
):
    """Auto-map source values to CDISC CT using fuzzy matching."""
    q = select(CTMapping).where(CTMapping.domain_code == domain_code, CTMapping.variable_name == variable_name, CTMapping.status == "Unmapped")
    if study_id: q = q.where(CTMapping.study_id == study_id)
    result = await db.execute(q)
    mappings = result.scalars().all()
    mapped_count = 0
    codelist_key = variable_name.upper()
    ct_terms = SEND_CT.get(codelist_key, [])
    ct_lookup = {t["label"].upper(): t["code"] for t in ct_terms}
    ct_lookup.update({t["code"].upper(): t["code"] for t in ct_terms})
    for m in mappings:
        match = ct_lookup.get(m.source_value.upper().strip())
        if match:
            m.ct_value = match; m.mapped = True; m.status = "Mapped"
            mapped_count += 1
    await db.commit()
    return {"mapped": mapped_count, "total": len(mappings), "unmapped": len(mappings) - mapped_count}
