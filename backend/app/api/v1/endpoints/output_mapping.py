"""FS22 – SEND Output Mapping"""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.domain import OutputMapping
from app.schemas.study import OutputMappingCreate, OutputMappingResponse

router = APIRouter()

# Default required variables per domain (from SEND IG 3.1)
DOMAIN_REQUIRED_VARS = {
    "DM": ["STUDYID","DOMAIN","USUBJID","SUBJID","RFSTDTC","SPECIES","SEX","ARMCD","ARM","SETCD"],
    "BW": ["STUDYID","DOMAIN","USUBJID","BWSEQ","BWTESTCD","BWTEST","BWORRES","BWORRESU","BWSTRESC","BWSTRESN","BWSTRESU","BWDTC"],
    "LB": ["STUDYID","DOMAIN","USUBJID","LBSEQ","LBTESTCD","LBTEST","LBORRES","LBORRESU","LBSTRESC","LBSTRESN","LBSTRESU","LBDTC"],
    "CL": ["STUDYID","DOMAIN","USUBJID","CLSEQ","CLTESTCD","CLTEST","CLMODIFY","CLDTC"],
    "MI": ["STUDYID","DOMAIN","USUBJID","MISEQ","MISPEC","MISTRESC","MISEV","MIDTC"],
    "MA": ["STUDYID","DOMAIN","USUBJID","MASEQ","MASPEC","MASTRESC","MADTC"],
    "OM": ["STUDYID","DOMAIN","USUBJID","OMSEQ","OMSPEC","OMORRES","OMORRESU","OMSTRESN","OMSTRESU","OMDTC"],
    "TS": ["STUDYID","DOMAIN","TSSEQ","TSPARMCD","TSPARM","TSVAL"],
    "TE": ["STUDYID","DOMAIN","ETCD","ELEMENT","TESTRL","TEENRL"],
    "TA": ["STUDYID","DOMAIN","ARMCD","ARM","TAETORD","ETCD","ELEMENT","TABRANCH","TATRANS","EPOCH"],
    "TX": ["STUDYID","DOMAIN","SETCD","SET","TXSEQ","TXPARMCD","TXPARM","TXVAL"],
    "DS": ["STUDYID","DOMAIN","USUBJID","DSSEQ","DSDECOD","DSTERM","DSSTDTC"],
    "EX": ["STUDYID","DOMAIN","USUBJID","EXSEQ","EXTRT","EXDOSE","EXDOSU","EXROUTE","EXSTDTC","EXENDTC"],
    "FW": ["STUDYID","DOMAIN","USUBJID","FWSEQ","FWTESTCD","FWTEST","FWORRES","FWORRESU","FWSTRESN","FWSTRESU","FWDTC"],
    "BG": ["STUDYID","DOMAIN","USUBJID","BGSEQ","BGTESTCD","BGTEST","BGORRES","BGORRESU","BGSTRESN","BGSTRESU","BGDTC"],
}

@router.get("/templates/{domain_code}", summary="FS22 – Get required variables for a domain")
async def get_domain_template(domain_code: str, _=Depends(get_current_user)):
    domain_code = domain_code.upper()
    vars_list = DOMAIN_REQUIRED_VARS.get(domain_code, [])
    if not vars_list: raise HTTPException(status_code=404, detail=f"No template for domain {domain_code}")
    return {"domain_code": domain_code, "required_variables": vars_list, "count": len(vars_list)}

@router.get("/{study_id}", response_model=List[OutputMappingResponse], summary="FS22 – Get output mappings for study")
async def get_output_mappings(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(OutputMapping).where(OutputMapping.study_id == study_id).order_by(OutputMapping.domain_code))
    return result.scalars().all()

@router.post("/{study_id}", response_model=OutputMappingResponse, status_code=201, summary="FS22 – Create output mapping")
async def create_output_mapping(study_id: uuid.UUID, body: OutputMappingCreate,
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    m = OutputMapping(**body.model_dump(), study_id=study_id)
    db.add(m); await db.commit(); await db.refresh(m)
    return m

@router.delete("/{study_id}/{mapping_id}", status_code=204)
async def delete_output_mapping(study_id: uuid.UUID, mapping_id: uuid.UUID,
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    m = await db.get(OutputMapping, mapping_id)
    if not m: raise HTTPException(status_code=404, detail="Mapping not found")
    await db.delete(m); await db.commit()
