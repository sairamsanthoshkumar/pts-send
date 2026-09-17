"""FS22/FS23/FS27 – SEND Output Transformation"""
import json
import uuid
import csv
import io
from pathlib import Path
from datetime import datetime, timedelta
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.domain import RawMeasurement
from app.schemas.study import TaskResponse
from app.core.logging import logger, write_domain_log
from sqlalchemy import select
from fastapi.responses import StreamingResponse

router = APIRouter()

def _is_replaced_group_name(name: str) -> bool:
    configured = {value.strip().casefold() for value in settings.REPLACED_ANIMAL_GROUP_NAMES.split(",") if value.strip()}
    normalized = name.strip().casefold()
    return any(value in normalized for value in configured)

def _filter_replaced_records(records: list, phase_rows: list[dict]) -> list:
    replaced_groups = {_design_value(row, "GROUP_NUMBER", "GROUP", "GRP_NUMBER") for row in phase_rows
                       if _is_replaced_group_name(_design_value(row, "GROUP_NAME", "GROUP_LABEL", "GROUP_TYPE_NAME"))}
    replaced_subjects = {_design_value(row, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID") for row in phase_rows
                         if _design_value(row, "GROUP_NUMBER", "GROUP", "GRP_NUMBER") in replaced_groups}
    if not replaced_groups and not replaced_subjects:
        return records
    return [record for record in records
            if _design_value(record.row_data, "GROUP_NUMBER", "GROUP", "GRP_NUMBER") not in replaced_groups
            and _design_value(record.row_data, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID") not in replaced_subjects]

RECID_VARIABLES = {"CL": "CLRECID", "PM": "PMRECID", "MA": "MARECID", "MI": "MIRECID", "TF": "TFRECID"}

def _apply_recids(records: list, connection_type: str) -> None:
    """Assign stable Pristima RECIDs while preserving imported RECIDs."""
    prefix = settings.RECID_PREFIX.strip()
    for record in records:
        domain = record.measurement_type.upper()
        recid_variable = RECID_VARIABLES.get(domain)
        if not recid_variable or record.row_data.get(recid_variable):
            continue
        if connection_type.upper() not in {"PRISTIMA_API", "OPENVMS"}:
            continue
        data = record.row_data
        source_id = _design_value(data, "PMFDAT_ID", "OBSDAT_ID", "MASSDA_ID", "PMTFDT_ID", "INOB_ID", "PMTSTA_ID", "PMFCOR_ID", "RECID_SOURCE_ID")
        if not source_id:
            continue
        if domain == "MA":
            code = "PF" if _design_value(data, "MAORRES", "FINDING_TYPE", "MAFINDINGTYPE") else "MN"
        elif domain == "MI":
            code = "TS" if _design_value(data, "PMTSTA_ID", "TISSUE_STATUS") else "PF" if _design_value(data, "MIORRES") else "MN"
        elif domain == "PM":
            code = "PM" if _design_value(data, "PMORRES") else "PN"
        else:
            code = "CL" if _design_value(data, "CLORRES") else "CN"
        data = dict(data)
        data[recid_variable] = f"{prefix + '-' if prefix else ''}{code}-{source_id}"
        record.row_data = data

def _relrec_identifier(record, domain: str) -> tuple[str, str]:
    recid = record.row_data.get(RECID_VARIABLES.get(domain, "")) if record else None
    if recid:
        return RECID_VARIABLES[domain], str(recid)
    sequence = record.row_data.get(f"{domain}SEQ") or record.record_id or ""
    return f"{domain}SEQ", str(sequence)

SEND_DOMAINS = ["TS","TE","SE","TA","TX","TT","TP","SS","DM","BW","MI","PC","SC","DS","DD","MA","TF","BG","OM","CL","FW","PM","PP","LB","EX","VS","EG","CO","RE","CV","IC","FM","PY","FX","DP"]

SEND_DOMAIN_CATALOG = {
    "TS": ("Protocol / Manual Entry", "FS27.1.1/FS27.1.2/FS27.1.3", "FS31.7.3"), "TE": ("Protocol / Manual Entry", "", ""),
    "SE": ("Protocol / Manual Entry", "", ""), "TA": ("Protocol / Manual Entry", "FS27.3", "FS31.7.4"), "TX": ("Protocol / Manual Entry", "FS27.5", ""), "TT": ("Protocol / Manual Entry", "FS30.8.1", ""), "TP": ("Protocol / Manual Entry", "FS30.8.2", ""), "SS": ("Protocol / Manual Entry", "FS30.8.3", ""),
    "DM": ("Study Animal", "FS27.5.1/FS27.5.2/FS27.5.3", "FS31.1.1"), "BW": ("Body weight / Terminal Body Weight", "FS27.6.1", "FS31.1.2/FS31.1.3/FS31.2"),
    "MI": ("Micro Observation", "FS27.7.1/FS27.7.2/FS27.7.3/FS27.7.4/FS27.7.5/FS27.7.6/FS27.7.7/FS27.7.8", "FS31.1.2/FS31.2/FS31.3/FS31.4/FS31.11"),
    "PC": ("Outside system", "FS27.8.1/FS27.8.2", "FS31.1.2/FS31.1.3/FS31.2/FS31.6.3/FS31.6/FS31.6.1"), "SC": ("Manual entry", "", "FS31.1.2"), "DS": ("Mark dead / complete", "", "FS31.1.3"),
    "DD": ("Mark dead with micro finding", "FS27.11.1/FS27.11.2", "FS31.1.2"), "MA": ("Gross Observation", "FS27.12.1/FS27.12.2/FS27.12.3", "FS31.1.2/FS31.2/FS31.4/FS31.11"),
    "TF": ("Micro Observation with Neoplasm finding", "FS27.13.1/FS27.13.2/FS27.13.3", "FS31.1.2/FS31.2/FS31.3/FS31.4"), "BG": ("Calculated from Body Weight", "FS27.15.1/FS27.15.2", "FS31.1.2/FS31.2"),
    "OM": ("Organ Weight", "FS27.16.1/FS27.16.2/FS27.16.3", "FS31.1.2/FS31.2/FS31.1.3/FS31.4/FS31.5"), "CL": ("Clinical Observations", "", "FS31.1.2/FS31.1.3/FS31.2/FS31.6.1"),
    "FW": ("Food and Water measurements", "FS27.18.1/FS27.18.2/FS27.18.3", "FS31.1.2/FS31.2/FS31.6.1/FS31.6.2"), "PM": ("Palpable Masses", "", "FS31.1.2/FS31.1.3/FS31.2"),
    "PP": ("Outside system", "FS27.8.1", "FS31.1.3/FS31.2/FS31.6.3/FS31.6/FS31.6.1"), "VS": ("Generalized Measurement or outside system", "", "FS31.1.2/FS31.2"),
    "EG": ("Generalized Measurement or outside system", "FS27.23.1", "FS31.1.2/FS31.2"), "LB": ("Sample Collection / Sample Result", "FS27.24.1/FS27.24.2/FS27.24.3/FS27.24.4/FS27.24.5/FS27.24.6/FS27.24.7", "FS31.1.2/FS31.1.3/FS31.2/FS31.4"),
    "CO": ("All applicable measurements", "FS27.25.1/FS27.25.2/FS27.25.3/FS27.25.4", "FS31.1.2/FS31.7.2/FS31.8"), "EX": ("Direct / Indirect Dosing", "FS27.31.1/FS27.31.2/FS27.31.3/FS27.31.4", ""),
    "RE": ("Generalized Measurement or outside system", "", "FS31.1.2/FS31.2"), "CV": ("Generalized Measurement or outside system", "", "FS31.1.2/FS31.2"), "IC": ("Uterine exam", "", "FS31.1.2/FS31.2"),
    "FM": ("Fetal details / fetal necropsy", "", "FS31.1.2/FS31.2"), "PY": ("C Section and Ovary Exam", "", "FS31.1.2/FS31.2"), "FX": ("Fetal Necropsy", "", "FS31.1.2/FS31.2"), "DP": ("Vaginal Opening and Preputial Separation Measurement", "", "FS31.1.2/FS31.2"),
}

def _truncate_to_minute(value: Any) -> str:
    parsed = _date_value({"value": value}, "value")
    return parsed.replace(second=0, microsecond=0).isoformat() if parsed else str(value or "").strip()

def _is_inhalation_record(data: dict) -> bool:
    calculation_type = str(data.get("CALCULATION_TYPE") or data.get("CALC_TYPE") or data.get("DOSING_CALCULATION_TYPE") or "").strip()
    route = str(data.get("EXROUTE") or data.get("ROUTE") or data.get("DOSING_ROUTE") or "").strip().upper()
    return calculation_type == "10" or route == "INHALATION"

def normalize_inhalation_exposure(data: dict) -> dict:
    """Apply FS27.32 minute precision, volume, and duration rules."""
    normalized = dict(data)
    if not _is_inhalation_record(normalized):
        return normalized
    for key in ("EXSTDTC", "EXENDTC", "EXRFTDTC"):
        if normalized.get(key):
            normalized[key] = _truncate_to_minute(normalized[key])
    normalized["EXVAMT"] = None
    normalized["EXVAMTU"] = None
    start = _date_value(normalized, "EXSTDTC")
    end = _date_value(normalized, "EXENDTC")
    if start and end and end >= start:
        duration_minutes = int((end - start).total_seconds() // 60)
        normalized["EXDUR"] = f"PT{duration_minutes}M"
    if not settings.Output_Actual_Dosage:
        return normalized
    return normalized

def apply_inhalation_postdose_precision(records_by_domain: dict[str, list], exposure_records: list) -> None:
    inhalation_subjects = {_subject_key(record.row_data) for record in exposure_records if _is_inhalation_record(record.row_data)}
    for domain_records in records_by_domain.values():
        for record in domain_records:
            if _subject_key(record.row_data) in inhalation_subjects and record.row_data.get("RFTDTC"):
                record.row_data = {**record.row_data, "RFTDTC": _truncate_to_minute(record.row_data["RFTDTC"])}

def apply_anatomical_region_rules(records_by_domain: dict[str, list], sendig_version: str) -> None:
    """Suppress ANTREG in SEND 3.1 when it exactly duplicates a mapped FOCID."""
    if not sendig_version.startswith("3.1"):
        return
    for domain in ("MA", "MI"):
        for record in records_by_domain.get(domain, []):
            data = dict(record.row_data)
            anatomical = next((str(data.get(key)).strip() for key in ("ANTREG", f"{domain}ANTREG", "ANATOMICAL_REGION", "ANATOMICAL_REGION_NAME") if data.get(key)), "")
            focid = str(data.get("FOCID", "")).strip()
            if anatomical and focid and anatomical.casefold() == focid.casefold():
                for key in ("ANTREG", f"{domain}ANTREG", "ANATOMICAL_REGION", "ANATOMICAL_REGION_NAME"):
                    if key in data:
                        data[key] = None
                record.row_data = data

def _apply_ex_dosing_specifications(records: list) -> None:
    if not settings.DOSING_SPECIFICATIONS:
        return
    try:
        specifications = json.loads(settings.DOSING_SPECIFICATIONS)
    except json.JSONDecodeError:
        logger.error("ex.dosing_specifications_invalid_json")
        return
    if not isinstance(specifications, list):
        return
    for record in records:
        data = record.row_data
        group = str(data.get("GRP_NUMBER") or data.get("GROUP_NUMBER") or data.get("GROUP") or "").strip().upper()
        sex = str(data.get("SEX", "")).strip().upper()
        regimen = str(data.get("REGIMEN") or data.get("DOSE_REGIMEN") or data.get("EXTRT") or "").strip().upper()
        match = next((item for item in specifications if isinstance(item, dict)
                      and str(item.get("group", "")).strip().upper() == group
                      and str(item.get("sex", "")).strip().upper() in {"", sex}
                      and str(item.get("regimen", "")).strip().upper() in {"", regimen}), None)
        if match:
            data = dict(data)
            for variable in ("EXDOSFRQ", "EXLOT", "EXTRT", "EXDOSE", "EXDOSTXT", "EXDOSU",
                             "EXDOSFRM", "EXROUTE", "EXLOC", "EXMETHOD", "EXTRTV"):
                if variable in match and match[variable] is not None:
                    data[variable] = str(match[variable]).strip()
            if match.get("frequency") is not None:
                data["EXDOSFRQ"] = str(match["frequency"]).strip()
            try:
                if float(str(data.get("EXDOSE", "")).strip()) == 0:
                    data["EXLOT"] = None
            except (TypeError, ValueError):
                pass
            record.row_data = data

def resolve_relrec_rows(relrec_rows: list[dict], main_records: dict[str, list], connection_type: str, sendig_version: str) -> list[dict]:
    """Resolve imported RELREC references against current main records."""
    resolved = []
    for relation in relrec_rows:
        output = dict(relation)
        domain = str(relation.get("RDOMAIN", "")).strip().upper()
        idvar = str(relation.get("IDVAR", "")).strip().upper()
        idvarval = str(relation.get("IDVARVAL", "")).strip()
        records = main_records.get(domain, [])
        subject = str(relation.get("USUBJID", "")).strip().upper()
        candidates = [record for record in records
                      if not subject or str(record.row_data.get("USUBJID", "")).strip().upper() == subject]
        is_sequence = idvar.endswith("SEQ")
        if is_sequence and idvarval:
            match = next((record for record in candidates if str(record.record_id or "").strip() == idvarval), None)
            if match:
                output["IDVARVAL"] = str(match.row_data.get(idvar, match.record_id or idvarval))
            else:
                logger.error("relrec.main_record_missing", domain=domain, idvar=idvar, idvarval=idvarval, subject=subject)
        elif idvarval:
            match = next((record for record in candidates
                          if str(record.row_data.get(idvar, "")).strip() == idvarval), None)
            if not match:
                logger.error("relrec.main_record_missing", domain=domain, idvar=idvar, idvarval=idvarval, subject=subject)
        output["RELTYPE"] = relation.get("RELTYPE", "")
        output["RELID"] = relation.get("RELID", "")
        resolved.append(output)
    return resolved

async def _resolve_stored_relrec(study_id: uuid.UUID, db: AsyncSession, sendig_version: str) -> None:
    result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "RELREC"))
    relation_records = list(result.scalars().all())
    if not relation_records:
        return
    main_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.notin_(("RELREC", "CO"))))
    main_records = {}
    for record in main_result.scalars().all():
        main_records.setdefault(record.measurement_type.upper(), []).append(record)
    rows = resolve_relrec_rows([record.row_data for record in relation_records], main_records, "", sendig_version)
    for record, row in zip(relation_records, rows):
        record.row_data = row

def _comment_value(data: dict, *keys: str) -> str:
    return next((str(data.get(key)).strip() for key in keys
                 if data.get(key) is not None and str(data.get(key)).strip()), "")

def _property_values(prefixes: tuple[str, ...]) -> set[str]:
    path = Path(__file__).resolve().parents[4] / "Application" / "TypeDefinition.properties"
    values = {value.strip().upper() for value in settings.GENERALIZED_ANIMAL_COMMENT_PARAMETERS.split(",") if value.strip()}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if "=" not in line or line.startswith("#"):
                continue
            key, value = line.split("=", 1)
            if any(key.strip().upper().startswith(prefix) for prefix in prefixes):
                values.update(item.strip().upper() for item in value.split(",") if item.strip())
    return values

def _generalized_animal_comment_parameters() -> set[str]:
    return _property_values(("ANIMAL_COMMENT_PARAMETER", "ANIMAL_LEVEL_COMMENT_PARAMETER", "GENERALIZED_ANIMAL_COMMENT"))

def _generalized_parameter_name(data: dict) -> str:
    return _comment_value(data, "PARAMETER_NAME", "PARAMETER", "LBTEST", "LBTESTCD", "EGTEST", "EGTESTCD", "VSTEST", "VSTESTCD")

def _comment_group_id(data: dict, domain: str) -> str:
    existing = data.get(f"{domain}GRPID") or data.get("GROUP_ID")
    if existing:
        return str(existing).strip()
    if domain in {"CL", "PM"}:
        return ",".join(str(data.get(key, "")).strip() for key in (
            "STUDY_ANIMAL_NUMBER", "ANIMAL_NUMBER", "SUBJID", "PHASE_NUMBER", "PHASE", "DAY_OF_PHASE", "DAYOFPHASE", "SESSION"
        ) if str(data.get(key, "")).strip())
    return ""

def _comment_co_row(record, domain: str, index: int, comment: str, group_id: str = "", sequence: str = "") -> dict | None:
    if not comment:
        return None
        sequence = sequence or record.row_data.get(f"{domain}SEQ") or record.record_id or ""
    return {"STUDYID": record.row_data.get("STUDYID", ""), "RDOMAIN": domain,
            "USUBJID": record.row_data.get("USUBJID", ""), "COSEQ": str(index),
            "IDVAR": f"{domain}SEQ" if sequence else "", "IDVARVAL": str(sequence), "COGRPID": group_id,
            "COCOMMENT": comment, "COMMENT": comment}

async def _generate_comment_records(study_id: uuid.UUID, db: AsyncSession, domains: list[str]) -> None:
    existing = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "CO",
        RawMeasurement.source_filename == "generated-comments"))
    for record in existing.scalars().all():
        await db.delete(record)
    sequence = 1
    for domain in domains:
        result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == domain))
        for record in result.scalars().all():
            data = record.row_data
            comment_specs = []
            if domain in {"MA", "MI"}:
                finding = _comment_value(data, "FINDING_COMMENT", "SIGN_COMMENT", f"{domain}COMMENT", "COMMENT")
                tissue = _comment_value(data, "TISSUE_COMMENT", "TISSUECOMMENT")
                animal = _comment_value(data, "ANIMAL_COMMENT", "ANIMALCOMMENT")
                if finding:
                    comment_specs.append((finding, "", data.get(f"{domain}SEQ") or record.record_id or str(sequence)))
                if tissue:
                    comment_specs.append((tissue, _comment_group_id(data, domain), ""))
                if animal:
                    comment_specs.append((animal, _comment_group_id(data, domain), ""))
            elif domain in {"CL", "LB", "PM"}:
                comment = _comment_value(data, "FINDING_COMMENT", "SIGN_COMMENT", "PARAMETER_COMMENT", "LBMODIFY", "LBCOMMENT", "LBCOM", "COMMENT")
                if comment:
                    comment_specs.append((comment, _comment_group_id(data, domain), data.get(f"{domain}SEQ") or record.record_id or str(sequence)))
            for comment, group_id, record_sequence in comment_specs:
                row = _comment_co_row(record, domain, sequence, comment, group_id, record_sequence)
                if row:
                    db.add(RawMeasurement(study_id=study_id, measurement_type="CO",
                                          source_filename="generated-comments", idvar=row["IDVAR"] if record_sequence else None,
                                          idvarval=row["IDVARVAL"] if record_sequence else None, r_domain=domain, row_data=row))
                    sequence += 1

    parameter_names = _generalized_animal_comment_parameters()
    if parameter_names:
        result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id))
        for record in result.scalars().all():
            domain = record.measurement_type.upper()
            if domain in {"CO", "MA", "MI", "CL", "LB", "PM"}:
                continue
            if _generalized_parameter_name(record.row_data).upper() not in parameter_names:
                continue
            comment = _comment_value(record.row_data, "RESULT", "VALUE", "ORRES", "STRESC", "PARAMETER_VALUE")
            row = _comment_co_row(record, domain, sequence, comment, _comment_group_id(record.row_data, domain), "")
            if row:
                db.add(RawMeasurement(study_id=study_id, measurement_type="CO",
                                      source_filename="generated-comments", r_domain=domain, row_data=row))
                sequence += 1

def _split_long_text(value: str, limit: int = 200) -> list[str]:
    parts = []
    remaining = str(value)
    while len(remaining) > limit:
        split_at = remaining.rfind(" ", 0, limit + 1)
        if split_at <= 0:
            split_at = limit
        parts.append(remaining[:split_at].rstrip())
        remaining = remaining[split_at:].lstrip()
    if remaining:
        parts.append(remaining)
    return parts

def _apply_long_text_rules(records: list, study_id: uuid.UUID) -> list[RawMeasurement]:
    """Apply FS31.7 long-text conventions and return generated SUPP records."""
    supplemental = []
    special_domains = {"CO", "TS", "TX"}
    for record in records:
        domain = record.measurement_type.upper()
        data = dict(record.row_data)
        if domain == "TX":
            if data.get("TXVAL") is not None:
                data["TXVAL"] = str(data["TXVAL"])[:200]
            record.row_data = data
            continue
        text_fields = ("COVAL", "COCOMMENT", "COMMENT") if domain == "CO" else ("TSVAL",) if domain == "TS" else tuple(
            key for key, value in data.items() if isinstance(value, str) and len(value) > 200
        ) if domain not in special_domains else ()
        for field in text_fields:
            value = data.get(field)
            if not isinstance(value, str) or len(value) <= 200:
                continue
            chunks = _split_long_text(value)
            data[field] = chunks[0]
            if domain in {"CO", "TS"}:
                for index, chunk in enumerate(chunks[1:], 1):
                    data[f"{field}{index}"] = chunk
            else:
                sequence = data.get(f"{domain}SEQ") or record.record_id or ""
                for index, chunk in enumerate(chunks[1:], 1):
                    supplemental.append(RawMeasurement(
                        study_id=study_id, measurement_type=f"SUPP{domain}", source_filename="generated-long-text",
                        idvar=f"{domain}SEQ" if sequence else None, idvarval=str(sequence) if sequence else None,
                        r_domain=domain, row_data={
                            "STUDYID": data.get("STUDYID", str(study_id)), "RDOMAIN": domain,
                            "USUBJID": data.get("USUBJID", ""), "IDVAR": f"{domain}SEQ" if sequence else "",
                            "IDVARVAL": str(sequence), "QNAM": f"{field}{index}",
                            "QLABEL": field, "QVAL": chunk, "QORIG": "CRF", "QEVAL": "",
                        }))
        record.row_data = data
    return supplemental

async def _generate_dp_bw_relrec(study_id: uuid.UUID, db: AsyncSession) -> None:
    """Link DP milestone body-weight parameters to matching BW records."""
    existing = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "RELREC",
        RawMeasurement.source_filename == "generated-dp-bw"))
    for record in existing.scalars().all():
        await db.delete(record)
    dp_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "DP"))
    bw_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "BW"))
    bw_records = list(bw_result.scalars().all())
    relation_number = 1
    for dp in dp_result.scalars().all():
        parameter = _generalized_parameter_name(dp.row_data).upper()
        if "MILESTONE" not in parameter or "BODY WEIGHT" not in parameter:
            continue
        subject = dp.row_data.get("USUBJID") or dp.row_data.get("SUBJID") or dp.row_data.get("SEDDM_ID")
        date = dp.row_data.get("DPDTC") or dp.row_data.get("DTC") or dp.row_data.get("DATE")
        match = next((bw for bw in bw_records
                      if subject and str(bw.row_data.get("USUBJID") or bw.row_data.get("SUBJID") or bw.row_data.get("SEDDM_ID")) == str(subject)
                      and (not date or str(bw.row_data.get("BWDTC") or bw.row_data.get("DTC") or "") == str(date))), None)
        if not match:
            continue
        dp_sequence = dp.row_data.get("DPSEQ") or dp.record_id or str(relation_number)
        bw_sequence = match.row_data.get("BWSEQ") or match.record_id or str(relation_number)
        for domain, sequence, index in (("DP", dp_sequence, 1), ("BW", bw_sequence, 2)):
            db.add(RawMeasurement(
                study_id=study_id, measurement_type="RELREC", source_filename="generated-dp-bw",
                idvar=f"{domain}SEQ", idvarval=str(sequence), r_domain=domain,
                row_data={"RELID": f"DPBW{relation_number}", "RDOMAIN": domain,
                          "IDVAR": f"{domain}SEQ", "IDVARVAL": str(sequence), "RELSEQ": index},
            ))
        relation_number += 1

def _pathology_result(data: dict, domain: str) -> str:
    type_value = str(data.get("MINEOTYPE" if domain == "MI" else "TFNEOTYPE", "")).strip()
    finding_key = "MIORRES" if domain == "MI" else "TFORRES"
    result_key = "MISTRESC" if domain == "MI" else "TFSTRESC"
    finding = str(data.get(finding_key, data.get("FINDING", ""))).strip()
    if not type_value:
        return str(data.get(result_key, finding)).strip()
    if not finding:
        finding = str(data.get(result_key, "")).strip()
    return finding

def _is_metastatic_finding(data: dict, domain: str) -> bool:
    type_value = str(data.get("MINEOTYPE" if domain == "MI" else "TFNEOTYPE", "")).upper()
    return "METASTATIC" in type_value or "LOCALLY INVASIVE" in type_value or "LOCAL INVASIVE" in type_value

def _death_relation(data: dict) -> str | None:
    if settings.PRIMARY_CAUSE_OF_DEATH_DB == "1":
        primary = str(data.get("PRIMARY_CAUSE_OF_DEATH", data.get("PRIMARY_CAUSE", ""))).upper()
        return "Y" if primary in {"Y", "YES", "TRUE", "1"} else None
    value = str(data.get("MIDTHREL", data.get("RELATION_TO_DEATH", data.get("DEATH_RELATION", "")))).strip().upper()
    if value in {"Y", "YES", "CAUSED DEATH"}:
        return "Y"
    if value in {"N", "NO", "DID NOT CAUSE DEATH"}:
        return "N"
    if value in {"U", "UNKNOWN"}:
        return "U"
    return None

def _apply_death_relations(data: dict, domain: str) -> dict:
    relation = _death_relation(data)
    if domain == "MI":
        data["MIDTHREL"] = relation
    elif domain == "TF":
        data["TFDTHREL"] = relation or ("N" if settings.PRIMARY_CAUSE_OF_DEATH_DB == "1" else "U")
    return data

def apply_focid_mappings(records_by_domain: dict[str, list], mappings: list, propagate_to_tf: bool = False) -> None:
    source_keys = {"EX": ("EXLOC",), "CL": ("CLLOC",), "MA": ("MALOC", "MASPEC", "TISSUE"),
                   "MI": ("MILOC", "MISPEC", "TISSUE")}
    def mapped_focid(domain: str, values: list[str], record) -> str | None:
        record_locator = str(record.row_data.get("MALOC" if domain == "MA" else "MILOC" if domain == "MI" else "CLLOC" if domain == "CL" else "EXLOC", "")).strip().upper()
        for mapping in mappings:
            if mapping.domain_code.upper() != domain or mapping.source_value.strip().upper() not in {value.upper() for value in values}:
                continue
            if mapping.locator and str(mapping.locator).strip().upper() != record_locator:
                continue
            return mapping.focid
        return None
    for domain, keys in source_keys.items():
        for record in records_by_domain.get(domain, []):
            values = [str(record.row_data.get(key, "")).strip() for key in keys if record.row_data.get(key)]
            if domain in {"MA", "MI"}:
                tissue = values[0] if values else ""
                locator = str(record.row_data.get("MALOC" if domain == "MA" else "MILOC", "")).strip()
                values.extend(value for value in (locator, f"{tissue}, {locator}" if tissue and locator else "") if value)
            focid = mapped_focid(domain, values, record)
            if focid:
                record.row_data = {**record.row_data, "FOCID": focid}
    if propagate_to_tf:
        for record in records_by_domain.get("TF", []):
            source = next((str(record.row_data.get(key, "")).strip() for key in ("TFLOC", "TFSPEC", "TISSUE") if record.row_data.get(key)), "")
            focid = mapped_focid("MI", [source], record)
            if focid:
                record.row_data = {**record.row_data, "FOCID": focid}

def _generate_tf_from_mi(mi_rows: list, tf_rows: list, study_id: uuid.UUID, db: AsyncSession) -> list:
    if tf_rows:
        return tf_rows
    generated = []
    for mi in mi_rows:
        if not str(mi.row_data.get("MINEOTYPE", "")).strip():
            continue
        generated.append(RawMeasurement(study_id=study_id, measurement_type="TF", source_filename="generated-from-mi",
                                        row_data={**mi.row_data, "TFORRES": mi.row_data.get("MIORRES", mi.row_data.get("FINDING", "")),
                                                  "TFSTRESC": mi.row_data.get("MISTRESC", "")}))
    db.add_all(generated)
    return generated

def _apply_finding_group_ids(records: list, domain: str) -> None:
    group_key = "MIGRPID" if domain == "MI" else "TFGRPID"
    tissue_finding_id = "PMTFDT_ID"
    if settings.MIGRPID_VAL == "0":
        for record in records:
            value = record.row_data.get(tissue_finding_id)
            record.row_data = {**record.row_data, group_key: value if value else None}
        return
    origins = {}
    for record in records:
        if not _is_metastatic_finding(record.row_data, domain):
            origin_id = record.row_data.get(tissue_finding_id) or record.row_data.get("ORIGIN_FINDING_ID") or record.row_data.get(group_key)
            if origin_id:
                origins[str(origin_id)] = record
    for record in records:
        if not _is_metastatic_finding(record.row_data, domain):
            record.row_data = {**record.row_data, group_key: None}
    for record in records:
        if not _is_metastatic_finding(record.row_data, domain):
            continue
        origin_id = str(record.row_data.get("ORIGIN_PMTFDT_ID") or record.row_data.get("ORIGIN_FINDING_ID") or record.row_data.get(group_key) or "")
        origin = origins.get(origin_id)
        group_id = origin.row_data.get(tissue_finding_id) if origin else origin_id
        if group_id:
            record.row_data = {**record.row_data, group_key: str(group_id)}
            if origin:
                origin.row_data = {**origin.row_data, group_key: str(group_id)}

def _format_metastatic_result(data: dict, origin: dict | None, domain: str) -> tuple[str, str]:
    finding_key = "MIORRES" if domain == "MI" else "TFORRES"
    result_key = "MISTRESC" if domain == "MI" else "TFSTRESC"
    if settings.METASTATIC_FND_DB != "1" or not _is_metastatic_finding(data, domain) or not origin:
        result = _pathology_result(data, domain)
        return result, result
    origin_result = _pathology_result(origin, domain)
    origin_tissue = str(origin.get("MISPEC" if domain == "MI" else "TFSPEC", "")).strip()
    finding = str(data.get(finding_key, "Metastasis, Present")).strip() or "Metastasis, Present"
    parts = [finding]
    if origin_tissue:
        parts.append(origin_tissue)
    if origin_result:
        parts.append(origin_result)
    return ", ".join(parts), origin_result

def _prepare_pathology_components(data: dict, domain: str) -> dict:
    finding_key = "MIORRES" if domain == "MI" else "TFORRES"
    result_key = "MISTRESC" if domain == "MI" else "TFSTRESC"
    distribution_key = "MIDISTR" if domain == "MI" else "TFDISTR"
    modifier_key = "MIRESMOD" if domain == "MI" else "TFRESMOD"
    finding = str(data.get(finding_key, "")).strip()
    if not finding:
        return data
    pieces = [piece.strip() for piece in finding.split(",")]
    if pieces and len(pieces[0]) > 2 and pieces[0][1] == "-":
        pieces[0] = pieces[0][2:].strip()
    if len(pieces) < 1:
        return data
    neoplasm_type = str(data.get("MINEOTYPE" if domain == "MI" else "TFNEOTYPE", "")).strip()
    chronicity_values = {"acute", "subacute", "chronic"}
    distribution_values = {"multi focal", "multifocal", "focal", "diffuse", "generalized", "segmented"}
    normalized_parts = [piece.lower().replace("-", " ") for piece in pieces]
    base_count = 2 if neoplasm_type and len(pieces) > 1 else 1
    if base_count == 1 and len(pieces) > 1 and normalized_parts[1] not in chronicity_values and normalized_parts[1] not in distribution_values:
        base_count = 1
    base = ", ".join(pieces[:base_count]).upper()
    modifier_values = pieces[base_count:]
    existing_distribution = str(data.get(distribution_key, "")).strip()
    chronicity = next((value for value in modifier_values if value.lower() in chronicity_values), "")
    if chronicity:
        modifier_values.remove(chronicity)
        data[chronicity_key] = chronicity.upper()
    distribution = next((value for value in modifier_values if value.lower().replace("-", " ") in distribution_values), "")
    if distribution:
        modifier_values.remove(distribution)
        data[distribution_key] = "MULTIFOCAL" if distribution.lower().replace("-", " ") == "multi focal" else distribution.upper()
    if existing_distribution and distribution and existing_distribution.upper() != data[distribution_key].upper():
        data[distribution_key] = f"{existing_distribution}; {data[distribution_key]}"
    existing_resmod = str(data.get(modifier_key, data.get("RESMOD", ""))).strip()
    modifier_values = [value for value in modifier_values if value.upper() not in {"SEVERE", "MIDDLE", "N", "Y"}]
    if modifier_values:
        data[modifier_key] = "; ".join(filter(None, (existing_resmod, "; ".join(modifier_values))))
    elif existing_resmod:
        data[modifier_key] = existing_resmod
    data[result_key] = base
    return data

def _mapped_value(mappings: list, variable: str, value: str) -> str:
    for mapping in mappings:
        if mapping.variable_name.upper() == variable.upper() and mapping.source_value.strip().upper() == value.strip().upper():
            return (mapping.ct_value or "").strip()
    return ""

def _compose_resmod(data: dict, domain: str, mappings: list, sendig_version: str) -> str:
    modifier_key = "MIRESMOD" if domain == "MI" else "TFRESMOD" if domain == "TF" else "MARESMOD"
    raw_values = [value.strip() for value in str(data.get("MODIFIERS2", "")).split(";") if value.strip()]
    raw_values.extend(value.strip() for value in str(data.get("RESMOD", "")).split(";") if value.strip())
    if domain == "MI":
        excluded_keys = ["MISEV", "MIDTHREL"]
        if not sendig_version.startswith("3.1"):
            pass
        else:
            excluded_keys.extend(["MICHRON", "MIDISTR"])
    elif domain == "MA":
        excluded_keys = ["MASEV", "MADTHREL"]
    else:
        excluded_keys = ["TFDTHREL"]
    if settings.PRIMARY_CAUSE_OF_DEATH_DB == "1" and domain in {"MI", "MA", "TF"}:
        excluded_keys = [key for key in excluded_keys if key not in {"MIDTHREL", "MADTHREL", "TFDTHREL"}]
    excluded = {part.strip().upper() for key in excluded_keys if data.get(key)
                for part in str(data.get(key, "")).split(";") if part.strip()}
    values = [value for value in raw_values if value.upper() not in excluded]
    mapped = _mapped_value(mappings, "RESMOD_SUBVAL", str(data.get(modifier_key, data.get("RESMOD", ""))))
    if mapped:
        values.append(mapped)
    return "; ".join(dict.fromkeys(values))

def _mass_number(data: dict) -> str:
    for key in ("MASS_NUMBER", "MASSNO", "PMNO", "PMSEQ", "PM_ID"):
        if data.get(key):
            return str(data[key]).strip()
    return ""

def _measurement_matches(left: dict, right: dict) -> bool:
    subject_match = any(left.get(key) and right.get(key) and str(left[key]).strip().upper() == str(right[key]).strip().upper()
                        for key in ("SEDDM_ID", "USUBJID", "SUBJID"))
    if not subject_match:
        return False
    left_tissue = str(left.get("SEDTIS_ID", left.get("TISSUE_ID", ""))).strip()
    right_tissue = str(right.get("SEDTIS_ID", right.get("TISSUE_ID", ""))).strip()
    return not left_tissue or not right_tissue or left_tissue.upper() == right_tissue.upper()

def _set_mass_id(data: dict, pm_rows: list[dict], target_key: str) -> dict:
    numbers = sorted({_mass_number(pm) for pm in pm_rows
                      if _measurement_matches(data, pm) and _mass_number(pm)})
    return {**data, target_key: ",".join(numbers)} if numbers else data

async def _generate_ma_followups(study_id: uuid.UUID, db: AsyncSession) -> None:
    from app.models.domain import RawMeasurement
    result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "CORR"))
    existing_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "MA",
        RawMeasurement.source_filename == "generated-correlation"))
    for existing in existing_result.scalars().all():
        await db.delete(existing)
    correlations = [row.row_data for row in result.scalars().all()
                    if str(row.row_data.get("CORRELATION_TYPE", "")) in {"1", "2"}
                    and str(row.row_data.get("CORRELATION_STATUS", "")) != "1"]
    for correlation in correlations:
        db.add(RawMeasurement(study_id=study_id, measurement_type="MA", source_filename="generated-correlation",
                               row_data={"SEDDM_ID": correlation.get("SEDDM_ID"),
                                         "SEDTIS_ID": correlation.get("SEDTIS_ID"),
                                         "MAREFID": correlation.get("REFID", correlation.get("CORRELATION_ID")),
                                         "MAORRES": correlation.get("CL_FINDING", correlation.get("SOURCE_FINDING", correlation.get("MASS_FINDING", ""))),
                                         "CORRELATION_TYPE": correlation.get("CORRELATION_TYPE"), "CORRELATION_STATUS": correlation.get("CORRELATION_STATUS")}))

def _dd_finding_values(data: dict) -> tuple[str, str, str]:
    tissue = str(data.get("TISSUE", data.get("MISPEC", ""))).strip()
    finding = str(data.get("MIORRES", data.get("FINDING", ""))).strip()
    result = str(data.get("MISTRESC", finding)).strip()
    modifiers = str(data.get("MIRESMOD", data.get("RESMOD", data.get("MODIFIERS2", "")))).strip()
    long_form = ", ".join(filter(None, (finding, modifiers)))
    animal_tissues = {name.strip().upper() for name in settings.DDTissueName.split(",") if name.strip()}
    is_animal_level = tissue.upper() in animal_tissues
    if not is_animal_level and settings.DDIncludeAnimalLevelTissue.upper() == "Y":
        long_form = ", ".join(filter(None, (tissue, long_form)))
    neoplasm_type = str(data.get("MINEOTYPE", "")).strip()
    finding_type = str(data.get("MIFINDINGTYPE", data.get("FINDING_TYPE", ""))).strip()
    category = "OTHER" if is_animal_level else " ".join(filter(None, (finding_type, neoplasm_type)))
    return long_form, result, category or "OTHER"

def _date_value(data: dict, *keys: str) -> datetime | None:
    for key in keys:
        value = data.get(key)
        if value:
            try:
                return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except ValueError:
                continue
    return None

def _numeric(data: dict, *keys: str) -> float | None:
    for key in keys:
        value = data.get(key)
        if value is None or str(value).strip() == "":
            continue
        try:
            return float(str(value).strip())
        except (TypeError, ValueError):
            continue
    return None

def _subject_reference_start_date(phase_rows: list[dict]) -> dict[str, str]:
    """Select RFSTDTC per subject using the FS31.1.1 phase priority."""
    grouped = {}
    for row in phase_rows:
        subject = _design_value(row, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        start = _date_value(row, "PHASE_START_DATE", "SESTDTC", "START_DATE")
        if not subject or not start:
            continue
        phase_type = _design_value(row, "PHASE_TYPE", "PHASE_CATEGORY", "ELEMENT_TYPE", "PHASE_TYPE_NAME").upper()
        phase_name = _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
        grouped.setdefault(subject, []).append((start, phase_type, phase_name, row))
    selected = {}
    for subject, candidates in grouped.items():
        priority = (("DOSING", "DOSE"), ("RANDOMIZATION", "RANDOM"), ())
        chosen = None
        for terms in priority:
            eligible = [item for item in candidates if (terms and any(term in item[1] or term in item[2] for term in terms))
                        or (not terms and not item[1].startswith("PRETEST") and not item[2].startswith("PRETEST"))]
            if eligible:
                chosen = min(eligible, key=lambda item: item[0])
                break
        if chosen is None:
            chosen = min(candidates, key=lambda item: item[0])
        selected[subject] = chosen[0].isoformat()
    return selected

def _relative_day(data_date: datetime, reference_date: datetime) -> int:
    return (data_date.date() - reference_date.date()).days + (1 if data_date.date() >= reference_date.date() else 0)

def _relative_week(data_date: datetime, reference_date: datetime) -> int:
    difference = (data_date.date() - reference_date.date()).days
    if difference >= 0:
        return int((difference + 0.5) / 7) + 1
    return -((abs(difference) + 6) // 7)

def _postnatal_day(data_date: datetime, birth_date: datetime) -> int:
    return (data_date.date() - birth_date.date()).days

def _apply_postnatal_dates(records: list, birth_dates: dict[str, datetime], juvenile_subjects: set[str]) -> None:
    """Populate FS31.1.6/FS31.1.7 postnatal day and week values."""
    for record in records:
        data = dict(record.row_data)
        subject = _design_value(data, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        phase = _design_value(data, "PHASE_NAME", "PHASE", "EPOCH").upper()
        if subject not in juvenile_subjects or "POSTNATAL" not in phase:
            record.row_data = data
            continue
        birth_date = _date_value(data, "BRTHDTC", "BIRTH_DATE", "BIRTHDTC") or birth_dates.get(subject)
        if not birth_date:
            record.row_data = data
            continue
        for key, value in list(data.items()):
            if not key.endswith("DTC") or key in {"BRTHDTC", "RFSTDTC"}:
                continue
            date = _date_value({"value": value}, "value")
            if not date:
                continue
            postnatal_day = _postnatal_day(date, birth_date)
            postnatal_week = _relative_week(date, birth_date)
            data.setdefault("POSTNATAL_DAY", postnatal_day)
            data.setdefault("POSTNATAL_WEEK", postnatal_week)
            data.setdefault("PNDY", postnatal_day)
            data.setdefault("PNWEEK", postnatal_week)
            break
        record.row_data = data

def _apply_reference_dates_and_study_days(records: list, phase_rows: list[dict]) -> None:
    reference_dates = _subject_reference_start_date(phase_rows)
    birth_dates = {}
    juvenile_subjects = set()
    for row in phase_rows:
        subject = _design_value(row, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        birth = _date_value(row, "BRTHDTC", "BIRTH_DATE", "BIRTHDTC")
        if subject and birth:
            birth_dates[subject] = birth
        if subject and ("POSTNATAL" in _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
                        or _design_value(row, "STUDY_TYPE", "STUDY_DESIGN").upper() == "JUVENILE"):
            juvenile_subjects.add(subject)
    for record in records:
        data = dict(record.row_data)
        subject = _design_value(data, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        reference = reference_dates.get(subject) or data.get("RFSTDTC")
        if record.measurement_type.upper() == "DM" and reference:
            data["RFSTDTC"] = reference
        if not reference:
            record.row_data = data
            continue
        reference_date = _date_value({"value": reference}, "value")
        for key, value in list(data.items()):
            if not key.endswith("DTC") or key == "RFSTDTC":
                continue
            date = _date_value({"value": value}, "value")
            if not date or not reference_date:
                continue
            prefix = key[:-3]
            day_key = f"{prefix}DY"
            data[day_key] = _relative_day(date, reference_date)
            week = _relative_week(date, reference_date)
            data.setdefault(f"{prefix}WEEK", week)
            data.setdefault(f"{prefix}_WEEK", week)
        birth_date = _date_value(data, "BRTHDTC", "BIRTH_DATE", "BIRTHDTC") or birth_dates.get(subject)
        if birth_date:
            for key, value in list(data.items()):
                if not key.endswith("DTC") or key in {"RFSTDTC", "BRTHDTC"}:
                    continue
                date = _date_value({"value": value}, "value")
                if date:
                    data.setdefault("AGE_DAY", _relative_day(date, birth_date))
                    data.setdefault("AGEDY", data["AGE_DAY"])
                    age_week = _relative_week(date, birth_date)
                    data.setdefault("AGE_WEEK", age_week)
                    data.setdefault("AGEWEEK", age_week)
        record.row_data = data
    _apply_postnatal_dates(records, birth_dates, juvenile_subjects)

def _apply_visit_days(records: list, phase_rows: list[dict], connection_type: str = "") -> None:
    """Calculate VISITDY from subject phase start and planned phase day."""
    phase_starts = {}
    for row in phase_rows:
        subject = _design_value(row, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        phase = _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
        start = _date_value(row, "PHASE_START_DATE", "SESTDTC", "START_DATE")
        if subject and phase and start:
            phase_starts[(subject, phase)] = start
    reference_dates = _subject_reference_start_date(phase_rows)
    for record in records:
        data = dict(record.row_data)
        domain = record.measurement_type.upper()
        phase = _design_value(data, "PHASE_NAME", "PHASE", "EPOCH").upper()
        subject = _design_value(data, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        day_text = _design_value(data, "DAY_OF_PHASE", "DAYOFPHASE", "PHASE_DAY", "DAY")
        if not subject or not phase or not day_text:
            record.row_data = data
            continue
        scheduled = _design_value(data, "SCHEDULED", "SCHEDULED_FLAG", "SCHEDULED_RECORD").upper()
        source = _design_value(data, "SOURCE_SYSTEM", "SOURCE", "CONNECTION_TYPE").upper()
        vpts = connection_type.upper() == "VPTS" or source == "VPTS"
        if scheduled in {"N", "NO", "FALSE", "0", "UNSCHEDULED", "U"} or (not scheduled and not (vpts and domain in {"CL", "PM"})):
            record.row_data = data
            continue
        try:
            phase_day = int(float(day_text.removeprefix("Day ").strip()))
        except ValueError:
            record.row_data = data
            continue
        phase_start = phase_starts.get((subject, phase))
        reference = _date_value({"value": reference_dates.get(subject)}, "value")
        if not phase_start or not reference:
            record.row_data = data
            continue
        planned_date = phase_start + timedelta(days=phase_day - 1)
        data["VISITDY"] = (planned_date.date() - reference.date()).days + (1 if planned_date.date() >= reference.date() else 0)
        record.row_data = data

def _apply_interval_and_nominal_days(records: list, phase_rows: list[dict], study_id: uuid.UUID) -> None:
    """Populate FS31.1.8 interval and FS31.1.9 nominal-day fields."""
    phase_lookup = {}
    for row in phase_rows:
        subject = _design_value(row, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        phase = _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
        phase_id = _design_value(row, "SEDPHS_ID", "PHASE_ID")
        if subject:
            phase_lookup[(subject, phase_id, phase)] = row
    scheduled_format = settings.NOMLBLFMT
    unscheduled_format = settings.NOMLBLFMT_UNSCHEDULED
    config_path = Path(settings.CSVInputDir) / str(study_id) / f"NOMLBL_{study_id}.txt"
    if config_path.exists():
        values = {}
        for line in config_path.read_text(encoding="utf-8-sig").splitlines():
            if "=" in line:
                key, value = line.split("=", 1)
                values[key.strip().upper()] = value.strip()
        scheduled_format = values.get("NOMLBLFMT", scheduled_format)
        unscheduled_format = values.get("NOMLBLFMT_UNSCHEDULED", unscheduled_format)
    for record in records:
        data = dict(record.row_data)
        subject = _design_value(data, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        phase = _design_value(data, "PHASE_NAME", "PHASE", "EPOCH").upper()
        phase_id = _design_value(data, "SEDPHS_ID", "PHASE_ID")
        phase_row = phase_lookup.get((subject, phase_id, phase)) or phase_lookup.get((subject, "", phase))
        if not phase_row:
            record.row_data = data
            continue
        phase_type = _design_value(phase_row, "PHASE_TYPE", "PHASE_TYPE_CODE", "PHASE_CATEGORY")
        data_date = next((_date_value({"value": value}, "value") for key, value in data.items() if key.endswith("DTC")
                          and key not in {"RFSTDTC", "BRTHDTC"} and value), None)
        phase_day = _design_value(data, "DAY_OF_PHASE", "DAYOFPHASE", "PHASE_DAY", "DAY")
        if data_date and phase_type in {"11", "13"}:
            interval_code = "G" if phase_type == "11" else "L"
            data["INTERVAL_CD"] = interval_code
            data["INTERVAL_DAY"] = int(float(phase_day.removeprefix("Day "))) if phase_day else None
        elif data_date:
            reference = _date_value(data, "RFSTDTC")
            if reference:
                data["INTERVAL_CD"] = "P"
                data["INTERVAL_DAY"] = _relative_day(data_date, reference)
        scheduled_flag = _design_value(data, "SCHEDULED", "SCHEDULED_FLAG").upper()
        scheduled = scheduled_flag in {"Y", "YES", "TRUE", "1", "SCHEDULED"}
        if not scheduled_flag and record.measurement_type.upper() in {"CL", "PM"}:
            scheduled = _design_value(data, "SOURCE_SYSTEM", "SOURCE", "CONNECTION_TYPE").upper() == "VPTS"
        nominal_day = data.get("VISITDY") if scheduled else next((value for key, value in data.items() if key.endswith("DY") and key not in {"VISITDY", "NOMDY"}), None)
        if nominal_day is not None:
            nominal_day = int(nominal_day)
            nominal_week = int((nominal_day + 0.5) / 7) + 1 if nominal_day >= 0 else -((abs(nominal_day) + 6) // 7)
            phase_label = _design_value(phase_row, "PHASE_NAME", "PHASE", "EPOCH")
            template = scheduled_format if scheduled else unscheduled_format
            data["NOMDY"] = nominal_day
            data["NOMLBL"] = (template.replace("{dd}", str(nominal_day)).replace("{ww}", str(nominal_week))
                              .replace("{pd}", phase_day.removeprefix("Day ") if phase_day else "")
                              .replace("{pw}", str(int((int(float(phase_day.removeprefix('Day '))) + 0.5) / 7) + 1) if phase_day else "")
                              .replace("{Phase Name}", phase_label))
        record.row_data = data

def _apply_phase_day_variables(records: list, phase_rows: list[dict]) -> None:
    """Populate FS31.1.10 planned/actual phase-day variables."""
    phase_lookup = {}
    for row in phase_rows:
        subject = _design_value(row, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        phase = _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
        phase_id = _design_value(row, "SEDPHS_ID", "PHASE_ID")
        start = _date_value(row, "PHASE_START_DATE", "SESTDTC", "START_DATE")
        if subject and start:
            phase_lookup[(subject, phase_id, phase)] = row
    for record in records:
        data = dict(record.row_data)
        subject = _design_value(data, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        phase = _design_value(data, "PHASE_NAME", "PHASE", "EPOCH").upper()
        phase_id = _design_value(data, "SEDPHS_ID", "PHASE_ID")
        phase_row = phase_lookup.get((subject, phase_id, phase)) or phase_lookup.get((subject, "", phase))
        if not phase_row:
            record.row_data = data
            continue
        phase_start = _date_value(phase_row, "PHASE_START_DATE", "SESTDTC", "START_DATE")
        planned_text = _design_value(data, "DAY_OF_PHASE", "DAYOFPHASE", "PHASE_DAY", "DAY")
        planned_day = None
        if planned_text:
            try:
                planned_day = int(float(planned_text.removeprefix("Day ").strip()))
            except ValueError:
                pass
        prefix = record.measurement_type.upper()
        scheduled_flag = _design_value(data, "SCHEDULED", "SCHEDULED_FLAG").upper()
        scheduled = scheduled_flag in {"Y", "YES", "TRUE", "1", "SCHEDULED"}
        if planned_day is not None and scheduled:
            data["RPPLDY"] = planned_day
            data[f"{prefix}RPPLSTDY"] = planned_day
        if phase_start:
            reference = _date_value(data, "RFSTDTC")
            if reference:
                data["RPRFDY"] = _relative_day(phase_start, reference)
            start_date = _date_value(data, f"{prefix}STDTC", f"{prefix}DTC", "START_DATE", "DTC")
            end_date = _date_value(data, f"{prefix}ENDTC", "END_DATE")
            day_zero = _design_value(phase_row, "DAY_ZERO", "DAYZERO").upper() == "Y"
            phase_day_offset = lambda date: (date.date() - phase_start.date()).days + (0 if day_zero else 1)
            if start_date:
                data[f"{prefix}RPSTDY"] = phase_day_offset(start_date)
                data[f"{prefix}RPDY"] = data[f"{prefix}RPSTDY"]
            if end_date:
                data[f"{prefix}RPENDY"] = phase_day_offset(end_date)
        if prefix == "CO" and (data.get("IDVAR") or data.get("IDVARVAL")):
            data.pop("CORPDY", None)
        record.row_data = data

NOT_TAKEN_STATUS_VARIABLES = {
    "BW": "BWSTAT", "BG": "BGSTAT", "CL": "CLSTAT", "FW": "FWSTAT", "LB": "LBSTAT",
    "MA": "MASTAT", "MI": "MISTAT", "OM": "OMSTAT", "PM": "PMSTAT", "PC": "PCSTAT",
    "PP": "PPSTAT", "TF": "TFSTAT", "VS": "VSSTAT", "EG": "EGSTAT", "CV": "CVSTAT", "RE": "RESTAT",
}

def _apply_not_taken_flags(records: list) -> None:
    """Apply FS31.2 ND terminology mapping for Pristima/vPTS status values."""
    for record in records:
        domain = record.measurement_type.upper()
        variable = NOT_TAKEN_STATUS_VARIABLES.get(domain)
        if not variable or variable not in record.row_data:
            continue
        data = dict(record.row_data)
        value = str(data.get(variable) or "").strip().upper()
        extensible = str(data.get(f"{variable}_EXTENSIBLE", data.get("ND_EXTENSIBLE", "N"))).upper() in {"Y", "YES", "TRUE", "1"}
        if not extensible and value in {"Y", "T"}:
            data[variable] = None
        elif not extensible and value in {"N", "F"}:
            data[variable] = "NOT DONE"
        record.row_data = data

def _apply_organ_weight_ratios(om_records: list, bw_records: list, study_id: uuid.UUID | None = None) -> None:
    """Calculate OM organ/body ratios and propagate missing-input status."""
    brain_tissue = settings.TATIO_TISSUE1_DB.strip().upper()
    organs = {}
    brains = {}
    terminal_weights = {}
    for record in om_records:
        data = record.row_data
        subject = _design_value(data, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        tissue = _design_value(data, "OMTISSUE", "OMSPEC", "TISSUE").upper()
        test_code = _design_value(data, "OMTESTCD", "TESTCD").upper()
        if not subject:
            continue
        if tissue == brain_tissue and test_code not in {"OWBR", "OWBW"}:
            brains[subject] = record
        elif test_code not in {"OWBR", "OWBW"}:
            organs[(subject, tissue)] = record
    for record in bw_records:
        data = record.row_data
        subject = _design_value(data, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        terminal = _design_value(data, "TERMINAL", "TERMINAL_FLAG", "BWTYPE", "BWSUBTYP").upper()
        if subject and terminal in {"Y", "YES", "TERMINAL", "TERMINAL BODY WEIGHT", "TBW"}:
            terminal_weights[subject] = record
    for (subject, tissue), organ in organs.items():
        organ_value = _numeric(organ.row_data, "OMSTRESN", "OMORRES", "ORGAN_WEIGHT", "WEIGHT")
        organ_status = _design_value(organ.row_data, "OMSTAT", "STATUS").upper()
        for ratio_code, denominator, reason in (("OWBR", brains.get(subject), "MISSING BRAIN WEIGHT"),
                                                 ("OWBW", terminal_weights.get(subject), "MISSING TERMINAL BODY WEIGHT")):
            ratio = next((record for record in om_records
                          if _design_value(record.row_data, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID") == subject
                          and _design_value(record.row_data, "OMTESTCD", "TESTCD").upper() == ratio_code
                          and _design_value(record.row_data, "OMTISSUE", "OMSPEC", "TISSUE").upper() == tissue), None)
            if not ratio and study_id:
                ratio = RawMeasurement(study_id=study_id, measurement_type="OM", source_filename="generated-organ-ratio",
                                       row_data={"USUBJID": subject, "OMTISSUE": tissue, "OMTESTCD": ratio_code,
                                                 "OMTEST": "Organ to Brain Weight Ratio" if ratio_code == "OWBR" else "Organ to Terminal Body Weight Ratio"})
                om_records.append(ratio)
            if not ratio:
                continue
            ratio_data = dict(ratio.row_data)
            denominator_value = _numeric(denominator.row_data, "OMSTRESN", "OMORRES", "BWSTRESN", "BWORRES", "BODY_WEIGHT") if denominator else None
            denominator_status = _design_value(denominator.row_data, "OMSTAT", "BWSTAT", "STATUS").upper() if denominator else "N"
            if organ_status in {"N", "F"} and _design_value(organ.row_data, "OMREASND", "REASON", "STATUS_NAME"):
                ratio_data["OMSTAT"] = "N"
                ratio_data["OMREASND"] = _design_value(organ.row_data, "OMREASND", "REASON", "STATUS_NAME")
            elif denominator_status in {"N", "F"} or denominator_value in (None, 0):
                ratio_data["OMSTAT"] = "N"
                ratio_data["OMREASND"] = reason
            elif organ_value is not None:
                value = organ_value / denominator_value * 100
                if settings.Round_before_calculations_DB:
                    value = round(value, 6)
                ratio_data["OMSTRESN"] = value
                ratio_data["OMORRES"] = value
                ratio_data["OMSTAT"] = ""
            if ratio_data.get("OMSTAT") == "N":
                for key in ("OMORRES", "OMSTRESC", "OMSTRESN", "OMORRESU", "OMSTREESU"):
                    ratio_data[key] = None
            ratio.row_data = ratio_data

def calculate_indirect_dose(food_consumption: float, concentration: float, purity: float,
                            start_body_weight: float, end_body_weight: float) -> float | None:
    """Calculate ADC = CONCi * FWSTRESN * purity / MBW / 100."""
    if start_body_weight <= 0 or end_body_weight <= 0:
        return None
    mid_interval_weight = (start_body_weight + end_body_weight) / 2
    return concentration * food_consumption * purity / mid_interval_weight / 100

def _is_indirect_dosing(data: dict) -> bool:
    route = str(data.get("EXROUTE") or data.get("ROUTE") or data.get("DOSING_ROUTE") or "").upper()
    dosing_type = str(data.get("DOSING_TYPE") or data.get("DOSE_TYPE") or "").upper()
    return "INDIRECT" in dosing_type or route in {"DIET", "WATER", "DIETARY", "DRINKING WATER"}

def _scheduled_body_weight(records: list, subject: str, target: datetime | None, latest: bool) -> float | None:
    candidates = []
    for record in records:
        data = record.row_data
        if _subject_key(data).upper() != subject.upper():
            continue
        if str(data.get("SCHEDULED", data.get("SCHEDULED_FLAG", "Y"))).upper() in {"N", "NO", "FALSE", "0"}:
            continue
        date = _date_value(data, "BWDTC", "DATE_TAKEN", "DATE_DATA_TAKEN")
        value = _numeric(data, "BWSTRESN", "BWORRES", "BODY_WEIGHT")
        if not date or value is None or not target:
            continue
        if latest and date.date() <= target.date() or not latest and date.date() == target.date():
            candidates.append((date, value))
    if not candidates:
        return None
    return (max(candidates, key=lambda item: item[0]) if latest else min(candidates, key=lambda item: abs(item[0] - target)))[1]

def _indirect_exposure_from_interval(fw: dict, bw_records: list, concentration: float, purity: float) -> dict | None:
    if not _is_indirect_dosing(fw):
        return None
    full = _numeric(fw, "FULL_CONTAINER_VALUE", "FULL_VALUE", "FULL_FEEDER_VALUE", "FULL_BOTTLE_VALUE")
    empty = _numeric(fw, "EMPTY_CONTAINER_VALUE", "EMPTY_VALUE", "EMPTY_FEEDER_VALUE", "EMPTY_BOTTLE_VALUE")
    food = _numeric(fw, "FWSTRESN", "FWORRES", "FOOD_CONSUMPTION", "FOOD_VALUE")
    start = _date_value(fw, "FULL_CONTAINER_DTC", "FULL_CONTAINER_DATETIME", "FWDTC", "START_DTC")
    end = _date_value(fw, "EMPTY_CONTAINER_DTC", "EMPTY_CONTAINER_DATETIME", "FWENDTC", "END_DTC")
    subject = _subject_key(fw)
    if full is None or empty is None or food is None or not start or not end or not subject:
        return None
    start_bw = _scheduled_body_weight(bw_records, subject, start, True)
    end_bw = _scheduled_body_weight(bw_records, subject, end, False)
    if start_bw is None or end_bw is None:
        return None
    dose = calculate_indirect_dose(food, concentration, purity, start_bw, end_bw)
    if dose is None:
        return None
    return {"SEDDM_ID": fw.get("SEDDM_ID"), "USUBJID": fw.get("USUBJID"),
            "EXTRT": fw.get("EXTRT", fw.get("DRUG_NAME", "")), "EXDOSE": dose,
            "EXVAMT": "", "EXVAMTU": "", "EXSTDTC": start.isoformat(), "EXENDTC": end.isoformat(),
            "EXROUTE": fw.get("EXROUTE", fw.get("ROUTE", "DIET")), "INDIRECT_DOSING": "Y"}

async def _generate_indirect_ex_records(study_id: uuid.UUID, db: AsyncSession) -> None:
    existing = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "EX",
        RawMeasurement.source_filename == "generated-indirect-dosing"))
    for record in existing.scalars().all():
        await db.delete(record)
    fw_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "FW"))
    bw_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "BW"))
    bw_records = list(bw_result.scalars().all())
    generated = []
    for fw in fw_result.scalars().all():
        data = fw.row_data
        concentration = _numeric(data, "CONCI", "CONCENTRATION", "DOSE_CONCENTRATION", "TARGET_CONCENTRATION")
        purity = _numeric(data, "PURITY", "ADJUSTMENT_VALUE", "ACTIVITY_PERCENT") or 100
        if concentration is None:
            continue
        row = _indirect_exposure_from_interval(data, bw_records, concentration, purity)
        if row:
            generated.append(RawMeasurement(study_id=study_id, measurement_type="EX",
                                            source_filename="generated-indirect-dosing", row_data=row))
    db.add_all(generated)

def _fw_bool(data: dict, *keys: str) -> bool:
    return str(next((data.get(key) for key in keys if data.get(key) is not None), "")).strip().upper() in {"Y", "YES", "TRUE", "1", "NOT TAKEN"}

def _normalize_fw_records(records: list, connector_type: str) -> list:
    prepared = []
    interval_starts: dict[str, datetime] = {}
    for record in records:
        data = dict(record.row_data)
        ff_present = _is_present(data.get("FF")) or _is_present(data.get("FOOD_VALUE")) or _is_present(data.get("FWORRES"))
        ef_present = _is_present(data.get("EF")) or _is_present(data.get("WATER_VALUE")) or _is_present(data.get("EW"))
        not_taken = _fw_bool(data, "FF_NOT_TAKEN", "FW_NOT_TAKEN", "EF_NOT_TAKEN", "EW_NOT_TAKEN", "NOT_TAKEN")
        if ff_present and not ef_present and not not_taken:
            data["_FW_OUTPUT_EXCLUDED"] = "Y"
            record.row_data = data
            continue
        if not_taken:
            data["FWSTAT"] = "N"
            data["FWREASND"] = data.get("FWREASND") or data.get("REASON_NOT_TAKEN") or data.get("NOT_TAKEN_REASON")
        elif _is_present(data.get("EF")) and str(data.get("EF")).strip().upper() in {"NOT TAKEN", "N"}:
            data["FWSTAT"] = "NOT DONE"
        if connector_type in {"PRISTIMA_API", "OPENVMS"}:
            unit = str(data.get("FWSTRESU", data.get("FWORRESU", ""))).strip()
            if unit and "/animal/day" not in unit.lower():
                data["FWSTRESU"] = unit.replace("/day", "/animal/day").replace("/Day", "/animal/day")
            elif unit in {"g", "mL", "ml"}:
                data["FWSTRESU"] = f"{unit}/animal/day"
        interval = f"{data.get('FWDTC', '')}|{data.get('FWENDTC', '')}"
        rfstdtc = _date_value(data, "RFSTDTC")
        if rfstdtc and interval:
            interval_starts[interval] = min(interval_starts.get(interval, rfstdtc), rfstdtc)
        prepared.append((record, data, interval))
    for record, data, interval in prepared:
        rfstdtc = interval_starts.get(interval) or _date_value(data, "RFSTDTC")
        fwdtc = _date_value(data, "FWDTC")
        fw_endtc = _date_value(data, "FWENDTC")
        if rfstdtc and fwdtc:
            offset = 1 if fwdtc >= rfstdtc else 0
            data["FWDY"] = (fwdtc - rfstdtc).days + offset
        if rfstdtc and fw_endtc:
            offset = 1 if fw_endtc >= rfstdtc else 0
            data["FWENDY"] = (fw_endtc - rfstdtc).days + offset
            data["FWENDDY"] = data["FWENDY"]
        record.row_data = data
    return [record for record, data, _ in prepared if data.get("_FW_OUTPUT_EXCLUDED") != "Y"]

def _apply_fw_pool_ids(study_id: uuid.UUID, fw_records: list, phase_rows: list[dict], dm_rows: list[dict], ds_rows: list[dict]) -> list[RawMeasurement]:
    """Populate FS31.6 FW POOLID values and return deduplicated POOLDEF records."""
    phase_members = {}
    for row in phase_rows:
        phase_id = _design_value(row, "SEDPHS_ID", "PHASE_ID")
        cage = _design_value(row, "CAGE_NUMBER", "CAGE", "GROUP_NUMBER", "GROUP")
        subject = _design_value(row, "SEDDM_ID", "USUBJID", "SUBJID", "ANIMAL_ID")
        if phase_id and cage and subject:
            phase_members.setdefault((phase_id, cage), set()).add(subject)
    group_members = {}
    for row in dm_rows:
        group = _design_value(row, "GRP_NUMBER", "GROUP_NUMBER", "GROUP")
        subject = _design_value(row, "SEDDM_ID", "USUBJID", "SUBJID", "ANIMAL_ID")
        if group and subject:
            group_members.setdefault(group, set()).add(subject)
    death_dates = {}
    for row in ds_rows:
        subject = _design_value(row, "SEDDM_ID", "USUBJID", "SUBJID", "ANIMAL_ID")
        death = _date_value(row, "DSSTDTC", "DEATH_DATE", "DSDTC")
        if subject and death:
            death_dates[subject] = death
    pool_members = {}
    for record in fw_records:
        data = dict(record.row_data)
        if _design_value(data, "POOLID"):
            continue
        phase_id = _design_value(data, "SEDPHS_ID", "PHASE_ID")
        cage = _design_value(data, "CAGE_NUMBER", "CAGE", "GROUP_NUMBER", "GROUP")
        members = group_members.get(cage, set()) if _fw_bool(data, "GFDR_FLAG", "GROUP_FEEDER") else phase_members.get((phase_id, cage), set())
        start = _date_value(data, "FWDTC")
        members = sorted(subject for subject in members if not start or not death_dates.get(subject) or death_dates[subject] >= start)
        if not members or not cage:
            continue
        pool_id = ";".join([cage] + members)
        data["POOLID"] = pool_id
        record.row_data = data
        pool_members.setdefault(pool_id, members)
    return [RawMeasurement(study_id=study_id, measurement_type="POOLDEF", source_filename="generated-fw-pooldef",
                           row_data={"STUDYID": str(study_id), "POOLID": pool_id, "POOLTYPE": "FW",
                                     "USUBJID": subject})
            for pool_id, members in pool_members.items() for subject in members]

def _subject_key(data: dict) -> str:
    return str(data.get("SEDDM_ID") or data.get("USUBJID") or data.get("SUBJID") or "").strip()

def _correlated_ids(correlation: dict, domain: str) -> set[str]:
    ids = set()
    domain_upper = domain.upper()
    for key, value in correlation.items():
        key_upper = key.upper()
        if domain_upper in key_upper and ("ID" in key_upper or "REF" in key_upper) and value:
            ids.update(part.strip() for part in str(value).replace(";", ",").split(",") if part.strip())
    return ids

def build_correlation_relrec_rows(correlation: dict, records_by_domain: dict[str, list]) -> list[dict]:
    """Build one RELREC row per correlated PM/MA/MI/CL record sharing a RELID."""
    subject = _subject_key(correlation)
    members = []
    for domain in ("PM", "MA", "MI", "CL"):
        ids = _correlated_ids(correlation, domain)
        for record in records_by_domain.get(domain, []):
            if subject and _subject_key(record.row_data) != subject:
                continue
            record_id = str(record.record_id or "").strip()
            sequence = str(record.row_data.get(f"{domain}SEQ") or record_id).strip()
            if ids and record_id not in ids and sequence not in ids:
                continue
            if not ids:
                continue
            identifier_name, identifier_value = _relrec_identifier(record, domain)
            members.append({"RDOMAIN": domain, "IDVAR": identifier_name, "IDVARVAL": identifier_value,
                            "RELTYPE": correlation.get("RELTYPE", "ONE"), "RELID": correlation.get("RELID", "")})
    return members

async def _generate_correlation_relrec(study_id: uuid.UUID, db: AsyncSession) -> None:
    existing = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "RELREC",
        RawMeasurement.source_filename == "generated-correlation"))
    for record in existing.scalars().all():
        await db.delete(record)
    corr_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "CORR"))
    main_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(("PM", "MA", "MI", "CL"))))
    records_by_domain: dict[str, list] = {}
    for record in main_result.scalars().all():
        records_by_domain.setdefault(record.measurement_type.upper(), []).append(record)
    rel_sequence = 1
    for correlation in corr_result.scalars().all():
        data = correlation.row_data
        if not str(data.get("CORRELATION_STATUS", "")).strip() or str(data.get("CORRELATION_STATUS")).strip() == "1":
            continue
        rows = build_correlation_relrec_rows(data, records_by_domain)
        relid = str(data.get("RELID") or data.get("CORRELATION_ID") or f"CORR{rel_sequence}")
        for row in rows:
            row["RELID"] = relid
            db.add(RawMeasurement(study_id=study_id, measurement_type="RELREC",
                                  source_filename="generated-correlation", idvar=row["IDVAR"],
                                  idvarval=row["IDVARVAL"], r_domain=row["RDOMAIN"], row_data=row))
        if rows:
            rel_sequence += 1

async def _generate_api_supplemental(study_id: uuid.UUID, db: AsyncSession, connection_type: str, domains: list[str]) -> None:
    if connection_type not in {"PRISTIMA_API", "OPENVMS"}:
        return
    for domain in domains:
        generated = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == f"SUPP{domain}",
            RawMeasurement.source_filename == "generated-supplemental"))
        for record in generated.scalars().all():
            await db.delete(record)
        result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == domain))
        for index, record in enumerate(result.scalars().all(), start=1):
            data = record.row_data
            sequence = data.get(f"{domain}SEQ") or record.record_id or str(index)
            supplements = []
            phase = next((data.get(key) for key in ("PHASE", "EPOCH", "PHASE_NAME") if data.get(key)), "")
            day = next((data.get(key) for key in ("DAYOFPHASE", "DAY_OF_PHASE", "PHASE_DAY") if data.get(key)), "")
            if phase: supplements.append(("PHASE", "Phase", phase))
            if day: supplements.append(("DAY", "Day of Phase", day))
            modifier_keys = {"MA": "MARESMOD", "MI": "MIRESMOD", "TF": "TFRESMOD"}
            modifier_key = modifier_keys.get(domain)
            if modifier_key and data.get(modifier_key):
                supplements.append((modifier_key, "Modifiers", data[modifier_key]))
            for qnam, qlabel, qval in supplements:
                db.add(RawMeasurement(study_id=study_id, measurement_type=f"SUPP{domain}",
                                      source_filename="generated-supplemental", idvar=f"{domain}SEQ",
                                      idvarval=str(sequence), r_domain=domain,
                                      row_data={"STUDYID": data.get("STUDYID", str(study_id)), "RDOMAIN": domain,
                                                "USUBJID": data.get("USUBJID", ""), "IDVAR": f"{domain}SEQ",
                                                "IDVARVAL": str(sequence), "QNAM": qnam, "QLABEL": qlabel,
                                                "QVAL": str(qval), "QORIG": "DERIVED", "QEVAL": ""}))

def _populate_tfdetect(tf_rows: list, all_rows: dict[str, list]) -> None:
    ex_by_subject: dict[str, list[datetime]] = {}
    for ex in all_rows.get("EX", []):
        phase = str(ex.row_data.get("PHASE", ex.row_data.get("EPOCH", ""))).upper()
        if phase in {"PRETEST", "PRETEST MATING", "PRETEST_MATING"}:
            continue
        date = _date_value(ex.row_data, "EXSTDTC")
        subject = _subject_key(ex.row_data)
        if date and subject:
            ex_by_subject.setdefault(subject, []).append(date)
    corr_rows = [row.row_data for row in all_rows.get("CORR", [])]
    for tf in tf_rows:
        subject = _subject_key(tf.row_data)
        treatment_dates = ex_by_subject.get(subject, [])
        if not treatment_dates:
            continue
        treatment_start = min(treatment_dates)
        detection_dates = []
        for source_domain, date_keys in (("CL", ("CLDTC",)), ("PM", ("PMDTC",)), ("MA", ("MADTC", "MAMTC")), ("MI", ("MIDTC",))):
            source_rows = all_rows.get(source_domain, [])
            for correlation in corr_rows:
                if subject and _subject_key(correlation) not in {"", subject}:
                    continue
                correlated_ids = _correlated_ids(correlation, source_domain)
                if not correlated_ids:
                    continue
                for source in source_rows:
                    source_id = str(source.row_data.get(f"SED{source_domain}_ID") or source.row_data.get(f"{source_domain}ID") or "").strip()
                    if correlated_ids and source_id not in correlated_ids:
                        continue
                    date = _date_value(source.row_data, *date_keys)
                    if date:
                        detection_dates.append(date)
        if not detection_dates:
            for domain, date_keys in (("CL", ("CLDTC",)), ("PM", ("PMDTC",)), ("MA", ("DSSTDTC",)), ("MI", ("DSSTDTC",))):
                detection_dates.extend(date for row in all_rows.get(domain, [])
                                        if _subject_key(row.row_data) == subject
                                        for date in [_date_value(row.row_data, *date_keys)] if date)
        if detection_dates:
            tf.row_data = {**tf.row_data, "TFDETECT": (min(detection_dates) - treatment_start).days + 1}

def _calculate_bg_records(study_id: uuid.UUID, bw_rows: list, db: AsyncSession) -> list:
    selected: dict[tuple[str, str], Any] = {}
    for bw in bw_rows:
        data = bw.row_data
        if str(data.get("TERMINAL", data.get("TERMINAL_FLAG", data.get("BWSUBTYP", data.get("BWTYPE", ""))))).upper() in {"Y", "YES", "TERMINAL", "TERMINAL BODY WEIGHT", "TBW"}:
            continue
        if str(data.get("UNSCHEDULED", data.get("UNSCHEDULED_FLAG", ""))).upper() in {"Y", "YES", "UNSCHEDULED", "U"}:
            continue
        if str(data.get("SCHEDULED", data.get("SCHEDULED_FLAG", ""))).upper() in {"N", "NO", "UNSCHEDULED", "U"}:
            continue
        subject = _subject_key(data)
        date = _date_value(data, "BWDTC", "DATE_TAKEN", "DATE_DATA_TAKEN")
        if not subject or not date:
            continue
        value = data.get("BWSTRESN", data.get("BWORRES", data.get("BODY_WEIGHT")))
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            continue
        day_key = (subject, date.date().isoformat())
        session = str(data.get("SESSION", data.get("SESSION_NUMBER", data.get("SCHEDULED_SESSION", ""))))
        current = selected.get(day_key)
        # Scheduled rows are already filtered above; the lowest session is first.
        if current is None or session < current[0]:
            selected[day_key] = (session, date, numeric_value, data)
    by_subject: dict[str, list] = {}
    for (subject, _), item in selected.items():
        by_subject.setdefault(subject, []).append(item)
    generated = []
    for subject, weights in by_subject.items():
        weights.sort(key=lambda item: item[1])
        for sequence, (previous, current) in enumerate(zip(weights, weights[1:]), 1):
            previous_value, current_value = previous[2], current[2]
            generated.append(RawMeasurement(study_id=study_id, measurement_type="BG", source_filename="generated-from-bw",
                                            row_data={"SEDDM_ID": current[3].get("SEDDM_ID"), "USUBJID": current[3].get("USUBJID"),
                                                      "BGSEQ": sequence, "BGSTRESN": current_value - previous_value,
                                                      "BGORRES": current_value - previous_value, "BGDTC": current[1].isoformat(),
                                                      "BGREFID": current[3].get("BW_ID", current[3].get("BWSEQ")),
                                                      "PREV_BW": previous_value, "CURRENT_BW": current_value}))
    db.add_all(generated)
    return generated

def _design_value(data: dict, *keys: str) -> str:
    for key in keys:
        value = data.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""

def _nonzero(data: dict, *keys: str) -> bool:
    value = _design_value(data, *keys)
    if not value:
        return False
    try:
        return float(value) != 0
    except ValueError:
        return value.upper() not in {"N", "NO", "FALSE"}

def _duration_iso(start: datetime | None, end: datetime | None, inclusive: bool = False) -> str:
    if not start or not end or end < start:
        return ""
    days = (end.date() - start.date()).days + (1 if inclusive else 0)
    return f"P{days}D"

def _trial_element_definitions(rows: list[dict]) -> list[dict[str, str]]:
    """Build FS30 phase and treatment elements from normalized Pristima design rows."""
    definitions = []
    seen = set()
    dose_by_group_sex = {}
    for row in rows:
        group = _design_value(row, "GROUP_NUMBER", "GROUP", "GRP_NUMBER")
        subgroup = _design_value(row, "SUBGROUP_NUMBER", "SUBGROUP", "SUBGROUP_ID")
        sex = _design_value(row, "SEX", "GENDER").upper()
        dose = _design_value(row, "GROUP_DOSAGE_TEXT", "PROTOCOL_DOSING_SPECIFICATION", "DOSAGE_TEXT", "GROUP_DOSAGE", "DOSE", "DOSE_LEVEL")
        if group and sex in {"M", "F"}:
            dose_by_group_sex[(group, subgroup, sex)] = dose
    code_counts = {}
    phases = []
    for row in rows:
        phase = _design_value(row, "PHASE_NAME", "PHASE", "EPOCH", "PHASE_DESCRIPTION")
        if phase and phase not in phases:
            phases.append(phase)
    for data in rows:
        phase = _design_value(data, "PHASE_NAME", "PHASE", "EPOCH", "PHASE_DESCRIPTION")
        if not phase:
            continue
        footnote = _design_value(data, "PHASE_FOOTNOTE", "PHASE_FOOTNOTE_SYMBOL", "FOOTNOTE")
        phase_code = f"PH{footnote}" if footnote else "PH"
        phase_key = ("phase", phase_code, phase)
        if phase_key not in seen:
            seen.add(phase_key)
            phase_index = phases.index(phase)
            last_phase = phase_index == len(phases) - 1
            necropsy = _design_value(data, "NECROPSY_SCHEDULED", "NECROPSY_SCHEDULE", "SACRIFICE_SCHEDULED", "SCHEDULED_SACRIFICE").upper()
            has_necropsy = necropsy in {"Y", "YES", "TRUE", "1"} or _date_value(data, "NECROPSY_DATE", "SACRIFICE_DATE", "SCHEDULED_SACRIFICE_DATE") is not None
            is_gestation = "GESTATION" in phase.upper() or _design_value(data, "STUDY_TYPE", "STUDY_DESIGN").upper() in {"EFD", "EMBRYO-FETAL DEVELOPMENT"}
            start_date = _date_value(data, "CONFIRMED_MATING_DATE", "MATING_DATE", "GESTATION_START_DATE") if is_gestation else None
            start_date = start_date or _date_value(data, "PHASE_START_DATE", "SESTDTC", "START_DATE")
            end_date = _date_value(data, "NEXT_PHASE_START_DATE", "SEENDTC", "END_DATE")
            if not last_phase:
                end_rule = f"End of {phase} phase"
                duration = _duration_iso(start_date, end_date)
            elif has_necropsy:
                end_rule = "Scheduled sacrifice"
                duration = _duration_iso(start_date, _date_value(data, "NECROPSY_DATE", "SACRIFICE_DATE", "SCHEDULED_SACRIFICE_DATE"), True)
            else:
                end_rule = "Last day on study"
                duration = ""
            definitions.append({"etcd": phase_code, "element": phase, "type": "PHASE", "source": data,
                                "TESTRL": f"Start of {phase} phase", "TEENRL": end_rule, "TEDUR": duration})

        scheduled = _design_value(data, "SCHEDULED", "SCHEDULED_FLAG", "REGIMEN_SCHEDULED").upper()
        if scheduled in {"N", "NO", "FALSE", "0", "UNSCHEDULED", "U"}:
            continue
        animals = _design_value(data, "REQUIRED_ANIMALS", "NUM_ANIMALS", "ANIMAL_COUNT", "N", "NUM_MALES", "NUM_FEMALES")
        if animals and not _nonzero({"value": animals}, "value"):
            continue
        dose = _design_value(data, "GROUP_DOSAGE_TEXT", "PROTOCOL_DOSING_SPECIFICATION", "DOSAGE_TEXT", "GROUP_DOSAGE", "DOSE", "DOSE_LEVEL")
        volume = _design_value(data, "DOSE_VOLUME", "DOSE_VOLUME_TEXT", "VOLUME")
        if not dose and not _nonzero(data, "DOSE", "DOSE_LEVEL"):
            continue
        if volume and not _nonzero(data, "DOSE_VOLUME", "VOLUME"):
            continue
        group = _design_value(data, "GROUP_NUMBER", "GROUP", "GRP_NUMBER")
        subgroup = _design_value(data, "SUBGROUP_NUMBER", "SUBGROUP", "SUBGROUP_ID")
        sex = _design_value(data, "SEX", "GENDER").upper()
        male_dose = dose_by_group_sex.get((group, subgroup, "M"))
        female_dose = dose_by_group_sex.get((group, subgroup, "F"))
        different_sex_doses = male_dose and female_dose and male_dose != female_dose
        prefix = sex if different_sex_doses and sex in {"M", "F"} else ""
        code = f"{prefix}{group}"
        if subgroup:
            code += f"S{subgroup}"
        code += _design_value(data, "TREATMENT_FOOTNOTE", "PHASE_FOOTNOTE", "PHASE_FOOTNOTE_SYMBOL", "FOOTNOTE")
        code += "D"
        compound = _design_value(data, "COMPOUND", "TEST_ARTICLE", "CONTROL_ARTICLE", "EXTRT")
        description = f"{code}/{('G' + group) if group else ''}"
        if subgroup:
            description += f"S{subgroup}"
        if compound:
            description += f":{compound}"
        if dose:
            description += f" {dose}"
        if _design_value(data, "DOSE_UNIT", "DOSAGE_UNIT", "EXDOSEU"):
            description += f"{_design_value(data, 'DOSE_UNIT', 'DOSAGE_UNIT', 'EXDOSEU')}"
        code_counts[code] = code_counts.get(code, 0) + 1
        if code_counts[code] > 1:
            code = f"{code}{code_counts[code]}"
            description = description.replace(f"{sex}{group}" if prefix else f"{group}", code, 1)
        key = ("treatment", code, description)
        if key not in seen:
            seen.add(key)
            phase_index = phases.index(phase)
            last_phase = phase_index == len(phases) - 1
            necropsy = _design_value(data, "NECROPSY_SCHEDULED", "NECROPSY_SCHEDULE", "SACRIFICE_SCHEDULED", "SCHEDULED_SACRIFICE").upper()
            has_necropsy = necropsy in {"Y", "YES", "TRUE", "1"} or _date_value(data, "NECROPSY_DATE", "SACRIFICE_DATE", "SCHEDULED_SACRIFICE_DATE") is not None
            if has_necropsy:
                end_rule = "Scheduled sacrifice"
            elif last_phase:
                end_rule = "Last day on study"
            else:
                end_rule = f"End of {description} plus one day"
            start_date = _date_value(data, "FIRST_SCHEDULED_DATE", "TREATMENT_START_DATE", "PHASE_START_DATE", "SESTDTC", "START_DATE")
            if "GESTATION" in phase.upper() or _design_value(data, "STUDY_TYPE", "STUDY_DESIGN").upper() in {"EFD", "EMBRYO-FETAL DEVELOPMENT"}:
                start_date = _date_value(data, "CONFIRMED_MATING_DATE", "MATING_DATE", "GESTATION_START_DATE") or start_date
            sacrifice_date = _date_value(data, "NECROPSY_DATE", "SACRIFICE_DATE", "SCHEDULED_SACRIFICE_DATE")
            last_date = _date_value(data, "LAST_SCHEDULED_DATE", "TREATMENT_END_DATE", "SEENDTC", "END_DATE")
            duration = _duration_iso(start_date, sacrifice_date, True) if has_necropsy else _duration_iso(start_date, last_date)
            definitions.append({"etcd": code, "element": description, "type": "TREATMENT", "source": data,
                                "TESTRL": f"First day of {description}", "TEENRL": end_rule, "TEDUR": duration})
    return definitions

def _trial_arm_definitions(rows: list[dict]) -> list[dict[str, object]]:
    """Build FS30.3 TA arms and their phase/treatment element references."""
    groups = {}
    for row in rows:
        group = _design_value(row, "GROUP_NUMBER", "GROUP", "GRP_NUMBER")
        subgroup = _design_value(row, "SUBGROUP_NUMBER", "SUBGROUP", "SUBGROUP_ID")
        sex = _design_value(row, "SEX", "GENDER").upper()
        if not group or sex not in {"M", "F"}:
            continue
        groups.setdefault((group, subgroup, sex), []).append(row)
    arms = []
    seen_arms = set()
    def group_labels(group: str, subgroup: str) -> tuple[str, str, str]:
        group_rows = [row for row in rows if _design_value(row, "GROUP_NUMBER", "GROUP", "GRP_NUMBER") == group
                      and _design_value(row, "SUBGROUP_NUMBER", "SUBGROUP", "SUBGROUP_ID") == subgroup]
        if not group_rows:
            return "", "", ""
        control = _design_value(group_rows[0], "GROUP_TYPE", "CONTROL_TYPE", "GROUP_TYPE_NAME") in {"2", "3", "POSITIVE CONTROL", "VEHICLE CONTROL"}
        selected = group_rows[0]
        if not control:
            selected = next((row for row in group_rows if _nonzero(row, "MALE_DOSAGE", "MALE_DOSE", "GROUP_DOSAGE_MALE", "DOSE_MALE")
                             or _nonzero(row, "FEMALE_DOSAGE", "FEMALE_DOSE", "GROUP_DOSAGE_FEMALE", "DOSE_FEMALE")), selected)
        male_row = next((row for row in group_rows if _design_value(row, "SEX", "GENDER").upper() == "M"), selected)
        female_row = next((row for row in group_rows if _design_value(row, "SEX", "GENDER").upper() == "F"), selected)
        compound = _design_value(selected, "COMPOUND_CODE", "COMPOUND", "TEST_ARTICLE", "CONTROL_ARTICLE", "EXTRT")
        units = _design_value(selected, "DOSE_UNIT", "DOSAGE_UNIT", "UNITS", "EXDOSEU")
        male = _design_value(male_row, "MALE_DOSAGE", "MALE_DOSE", "GROUP_DOSAGE_MALE", "DOSE_MALE", "GROUP_DOSAGE")
        female = _design_value(female_row, "FEMALE_DOSAGE", "FEMALE_DOSE", "GROUP_DOSAGE_FEMALE", "DOSE_FEMALE", "GROUP_DOSAGE")
        combined = male if male == female or not female else f"{male}/{female}"
        base = f"G{group} - {compound}: {combined}{units}".strip()
        male_label = f"G{group} - {compound}: {male}{units}".strip()
        female_label = f"G{group} - {compound}: F:{female}{units}".strip()
        return base, male_label, female_label
    for (group, subgroup, sex), assigned_rows in groups.items():
        counterpart = groups.get((group, subgroup, "F" if sex == "M" else "M"), [])
        dose = _design_value(assigned_rows[0], "GROUP_DOSAGE_TEXT", "PROTOCOL_DOSING_SPECIFICATION", "DOSAGE_TEXT", "GROUP_DOSAGE", "DOSE", "DOSE_LEVEL")
        counterpart_dose = _design_value(counterpart[0], "GROUP_DOSAGE_TEXT", "PROTOCOL_DOSING_SPECIFICATION", "DOSAGE_TEXT", "GROUP_DOSAGE", "DOSE", "DOSE_LEVEL") if counterpart else dose
        sex_split = bool(counterpart and dose != counterpart_dose)
        group_prefix = sex if sex_split else ""
        arm_code = f"{group_prefix}{group}"
        if subgroup:
            arm_code += f"S{subgroup}"
        recovery_rows = [row for row in assigned_rows if _design_value(row, "RECOVERY", "RECOVERY_PHASE", "RECOVERY_FLAG").upper() in {"Y", "YES", "TRUE", "1"}
                         or "RECOVERY" in _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()]
        recovery_count = _design_value(assigned_rows[0], "RECOVERY_ANIMAL_COUNT", "NUM_RECOVERY_ANIMALS")
        total_count = _design_value(assigned_rows[0], "REQUIRED_ANIMALS", "NUM_ANIMALS", "ANIMAL_COUNT", "N")
        partial_recovery = bool(recovery_rows) and (not recovery_count or recovery_count != total_count)
        arm_variants = [(False, assigned_rows)]
        if partial_recovery:
            arm_variants = [(True, recovery_rows), (False, [row for row in assigned_rows if row not in recovery_rows])]
        for recovery, variant_rows in arm_variants:
            if not variant_rows:
                continue
            if not sex_split and not recovery and counterpart:
                variant_rows = variant_rows + counterpart
            variant_code = arm_code + ("R" if recovery else "")
            if variant_code in seen_arms:
                continue
            seen_arms.add(variant_code)
            elements = _trial_element_definitions(variant_rows)
            group_type = _design_value(variant_rows[0], "GROUP_TYPE", "CONTROL_TYPE", "GROUP_TYPE_NAME")
            group_name = _design_value(variant_rows[0], "GROUP_NAME", "MALE_GROUP_NAME", "FEMALE_GROUP_NAME")
            group_label, male_group_label, female_group_label = group_labels(group, subgroup)
            group_label = group_label or _design_value(variant_rows[0], "GROUP_LABEL", "MALE_GROUP_LABEL", "FEMALE_GROUP_LABEL", "GRPLBL")
            dose_unit = _design_value(variant_rows[0], "DOSE_UNIT", "DOSAGE_UNIT", "EXDOSEU")
            arms.append({"armcd": variant_code, "arm": f"{group_type} {variant_code}".strip(),
                         "sex": sex if sex_split else "", "group": group, "subgroup": subgroup,
                         "group_name": group_name, "group_label": group_label, "male_group_label": male_group_label,
                         "female_group_label": female_group_label, "dose": dose,
                         "dose_unit": dose_unit,
                         "elements": [item["etcd"] for item in elements]})
    return arms

def _trial_set_records(study_id: uuid.UUID, rows: list[dict]) -> list[dict]:
    """Create FS30.4 trial-set parameter rows for each derived trial arm."""
    records = []
    for arm in _trial_arm_definitions(rows):
        parameters = [
            ("ARMCD", "Arm Code", arm["armcd"]),
            ("SPGRPCD", "Sponsor-Defined Group Code", arm["group"]),
            ("GRPLBL", "Group Label", arm["male_group_label"] if arm["sex"] == "M" else arm["female_group_label"] if arm["sex"] == "F" else arm["group_label"]),
            ("TRTDOS", "Treatment element for the group", arm["dose"]),
            ("TRTDOSU", "Dose Units", arm["dose_unit"]),
        ]
        for sequence, (parameter_code, parameter, value) in enumerate(parameters, 1):
            if value is None or not str(value).strip():
                continue
            records.append({"STUDYID": str(study_id), "SETCD": arm["armcd"],
                            "SET": f"{arm['group']} {arm['group_name']} {arm['armcd']}".strip(),
                            "TXSEQ": sequence, "TXPARMCD": parameter_code,
                            "TXPARM": parameter, "TXVAL": str(value), "ARMCD": arm["armcd"]})
    return records

def _trial_stage_records(study_id: uuid.UUID, rows: list[dict]) -> list[dict]:
    """Create FS30.8.1 EFD trial stages from unique necropsy schedules."""
    stage_rows = [row for row in rows if "GESTATION" in _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
                  or "POSTNATAL" in _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
                  or _design_value(row, "STUDY_TYPE", "STUDY_DESIGN").upper() in {"EFD", "EMBRYO-FETAL DEVELOPMENT", "JUVENILE"}]
    if not stage_rows:
        return []
    juvenile = any("POSTNATAL" in _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
                   or _design_value(row, "STUDY_TYPE", "STUDY_DESIGN").upper() == "JUVENILE" for row in stage_rows)
    schedules = {}
    for row in stage_rows:
        day = _design_value(row, "NECROPSY_SCHEDULED_DAY", "SCHEDULED_NECROPSY_DAY", "NECROPSY_DAY", "SACRIFICE_DAY")
        if not day:
            continue
        schedule_status = _design_value(row, "SCHEDULED_DEATH_STATUS", "NECROPSY_STATUS", "DEATH_STATUS", "SACRIFICE_STATUS")
        group = _design_value(row, "GROUP_NUMBER", "GROUP", "GRP_NUMBER")
        subgroup = _design_value(row, "SUBGROUP_NUMBER", "SUBGROUP", "SUBGROUP_ID")
        schedules.setdefault((day, schedule_status), []).append((group, subgroup, row))
    if not schedules:
        return []
    phase_name = _design_value(stage_rows[0], "PHASE_NAME", "PHASE", "EPOCH") or ("Postnatal" if juvenile else "Gestation")
    multiple_schedules = len(schedules) > 1
    records = []
    for (day, status), assignments in sorted(schedules.items(), key=lambda item: item[0]):
        if not multiple_schedules:
            stage_code = "JTA" if juvenile else "GEST"
        else:
            group, subgroup, _ = min(assignments, key=lambda item: (
                int(item[0]) if item[0].isdigit() else float("inf"),
                int(item[1]) if item[1].isdigit() else float("inf")))
            stage_code = "JTA" if juvenile else "GEST"
            assignment_groups = {item[0] for item in assignments if item[0]}
            assignment_subgroups = {item[1] for item in assignments if item[1]}
            all_groups = {_design_value(item, "GROUP_NUMBER", "GROUP", "GRP_NUMBER") for item in stage_rows}
            subgroup_only = len(all_groups) <= 1 and bool(assignment_subgroups)
            if group and not subgroup_only:
                stage_code += group
            if subgroup and (subgroup_only or group):
                stage_code += f"S{subgroup}"
            if not group and subgroup:
                stage_code = f"{'JTAS' if juvenile else 'GESTS'}{subgroup}"
        stage = f"{phase_name} {day}D" if juvenile else f"{stage_code} - {phase_name} {day}D"
        stage_group, stage_subgroup, _ = min(assignments, key=lambda item: (
            int(item[0]) if item[0].isdigit() else float("inf"),
            int(item[1]) if item[1].isdigit() else float("inf")))
        records.append({"STUDYID": str(study_id), "STGCD": stage_code, "STAGE": stage,
                    "TTSTRL": settings.JUVENILE_STAGE_START_RULE if juvenile else settings.EFD_STAGE_START_RULE, "TTENRL": status,
                        "TTDUR": f"P{int(day) + 1}D" if str(day).isdigit() else "",
                        "GROUP_NUMBER": stage_group, "SUBGROUP_NUMBER": stage_subgroup})
    return records

def _trial_path_records(study_id: uuid.UUID, rows: list[dict]) -> list[dict]:
    """Create the one-to-one FS30.8.2 path for each EFD/juvenile trial stage."""
    stage_rows = [row for row in rows if "GESTATION" in _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
                  or "POSTNATAL" in _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
                  or _design_value(row, "STUDY_TYPE", "STUDY_DESIGN").upper() in {"EFD", "EMBRYO-FETAL DEVELOPMENT", "JUVENILE"}]
    if not stage_rows:
        return []
    juvenile = any("POSTNATAL" in _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
                   or _design_value(row, "STUDY_TYPE", "STUDY_DESIGN").upper() == "JUVENILE" for row in stage_rows)
    paths = []
    for stage in _trial_stage_records(study_id, stage_rows):
        matching = next((row for row in stage_rows
                         if _design_value(row, "GROUP_NUMBER", "GROUP", "GRP_NUMBER") == stage.get("GROUP_NUMBER", "")
                         and _design_value(row, "SUBGROUP_NUMBER", "SUBGROUP", "SUBGROUP_ID") == stage.get("SUBGROUP_NUMBER", "")), stage_rows[0])
        phase = _design_value(matching, "PHASE_NAME", "PHASE", "EPOCH") or ("Postnatal" if juvenile else "Gestation")
        start_day = _design_value(matching, "PHASE_START_DAY", "PHASE_DAY", "START_DAY", "REPRO_PHASE_START_DAY")
        start_day = start_day.removeprefix("Day ").strip() if start_day else ""
        stage_description = stage["STAGE"]
        if juvenile:
            stage_description = f"Juvenile Animal - {stage_description}"
        paths.append({"STUDYID": str(study_id), "PATHCD": stage["STGCD"], "PATH": stage_description,
                      "TPSTGORD": 1, "TPBRANCH": None, "STGCD": stage["STGCD"], "STAGE": stage["STAGE"], "RPHASE": phase,
                      "RPRFDY": int(start_day) if start_day.lstrip("-").isdigit() else None,
                      "GROUP_NUMBER": _design_value(matching, "GROUP_NUMBER", "GROUP", "GRP_NUMBER"),
                      "SUBGROUP_NUMBER": _design_value(matching, "SUBGROUP_NUMBER", "SUBGROUP", "SUBGROUP_ID")})
    return paths

def _subject_stage_records(study_id: uuid.UUID, rows: list[dict]) -> list[dict]:
    """Create one SS record per subject from its assigned trial path/stage."""
    paths = _trial_path_records(study_id, rows)
    if not paths:
        return []
    unique_subjects = {}
    for row in rows:
        subject = _design_value(row, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        if subject:
            unique_subjects.setdefault(subject, row)
    records = []
    for subject, row in unique_subjects.items():
        group = _design_value(row, "GROUP_NUMBER", "GROUP", "GRP_NUMBER")
        subgroup = _design_value(row, "SUBGROUP_NUMBER", "SUBGROUP", "SUBGROUP_ID")
        path = next((item for item in paths if item["GROUP_NUMBER"] == group and item["SUBGROUP_NUMBER"] == subgroup), paths[0])
        records.append({"STUDYID": str(study_id), "USUBJID": subject, "PATHCD": path["PATHCD"],
                "PATH": path["PATH"], "RSTGCD": path["PATHCD"], "RSTAGE": path["STAGE"],
                        "SJSTDTC": _design_value(row, "PHASE_START_DATE", "SESTDTC", "START_DATE", "CONFIRMED_MATING_DATE", "MATING_DATE"),
                        "SJENDTC": _design_value(row, "DEATH_DATE", "ANIMAL_DEATH_DATE", "DEATH_DATETIME", "RFENDTC")})
    return records

def _apply_dart_paths(dm_rows: list, path_rows: list[dict]) -> None:
    """Assign DART DM PATHCD/PATH using each animal's group and subgroup."""
    for dm in dm_rows:
        data = dm.row_data
        group = _design_value(data, "GROUP_NUMBER", "GROUP", "GRP_NUMBER")
        subgroup = _design_value(data, "SUBGROUP_NUMBER", "SUBGROUP", "SUBGROUP_ID")
        path = next((item for item in path_rows if item.get("GROUP_NUMBER", "") == group
                     and item.get("SUBGROUP_NUMBER", "") == subgroup), None)
        if path:
            data = dict(data)
            data["PATHCD"] = path.get("PATHCD")
            data["PATH"] = path.get("PATH")
            dm.row_data = data

def _juvenile_litterid_records(study_id: uuid.UUID, rows: list[dict], output_dart_version: str) -> list[dict]:
    """Create FS30.8.6 SC LITTERID rows for juvenile DART 1.2 output only."""
    if output_dart_version != "1.2" or not any(
        "POSTNATAL" in _design_value(row, "PHASE_NAME", "PHASE", "EPOCH").upper()
        or _design_value(row, "STUDY_TYPE", "STUDY_DESIGN").upper() == "JUVENILE" for row in rows):
        return []
    records = []
    seen = set()
    for row in rows:
        subject = _design_value(row, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        dam_number = _design_value(row, "DAM_NUMBER", "DAMNO", "DAM_NUM", "DAMNUMBER", "DAM_ID")
        if not subject or not dam_number or subject in seen:
            continue
        seen.add(subject)
        records.append({"STUDYID": str(study_id), "DOMAIN": "SC", "USUBJID": subject, "SCSEQ": 1,
                        "SCTESTCD": "LITTERID", "SCTEST": "Litter Identifier",
                        "SCORRES": dam_number, "SCSTRESC": dam_number})
    return records

async def _generate_pristima_trial_sets(study_id: uuid.UUID, phase_rows: list, existing_rows: list, db: AsyncSession) -> list:
    generated_existing = [row for row in existing_rows if row.source_filename == "generated-from-study-design"]
    for row in generated_existing:
        await db.delete(row)
    records = []
    for row in _trial_set_records(study_id, [item.row_data for item in phase_rows]):
        records.append(RawMeasurement(study_id=study_id, measurement_type="TX", source_filename="generated-from-study-design", row_data=row))
    db.add_all(records)
    return records

async def _generate_pristima_trial_stages(study_id: uuid.UUID, phase_rows: list, existing_rows: list, db: AsyncSession) -> list:
    generated_existing = [row for row in existing_rows if row.source_filename == "generated-from-study-design"]
    for row in generated_existing:
        await db.delete(row)
    records = [RawMeasurement(study_id=study_id, measurement_type="TT", source_filename="generated-from-study-design", row_data=row)
               for row in _trial_stage_records(study_id, [item.row_data for item in phase_rows])]
    db.add_all(records)
    return records

async def _generate_pristima_trial_paths(study_id: uuid.UUID, phase_rows: list, existing_rows: list, db: AsyncSession) -> list:
    generated_existing = [row for row in existing_rows if row.source_filename == "generated-from-study-design"]
    for row in generated_existing:
        await db.delete(row)
    records = [RawMeasurement(study_id=study_id, measurement_type="TP", source_filename="generated-from-study-design", row_data=row)
               for row in _trial_path_records(study_id, [item.row_data for item in phase_rows])]
    db.add_all(records)
    return records

def _generate_pristima_trial_arms(study_id: uuid.UUID, phase_rows: list, existing_rows: list, db: AsyncSession) -> list:
    if existing_rows:
        return existing_rows
    generated = []
    for sequence, arm in enumerate(_trial_arm_definitions([row.row_data for row in phase_rows]), 1):
        for order, element in enumerate(arm["elements"], 1):
            generated.append(RawMeasurement(study_id=study_id, measurement_type="TA", source_filename="generated-from-study-design",
                                            row_data={"STUDYID": str(study_id), "ARMCD": arm["armcd"], "ARM": arm["arm"],
                                                      "TAETORD": order, "ETCD": element, "SEX": arm["sex"],
                                                      "GROUP_NUMBER": arm["group"], "SUBGROUP_NUMBER": arm["subgroup"],
                                                      "ARM_SEQUENCE": sequence}))
    db.add_all(generated)
    return generated

def _generate_pristima_subject_elements(study_id: uuid.UUID, phase_rows: list, existing_rows: list, db: AsyncSession) -> list:
    if existing_rows:
        return existing_rows
    generated = []
    definitions = _trial_element_definitions([phase.row_data for phase in phase_rows])
    for phase in phase_rows:
        data = phase.row_data
        subject = _subject_key(data)
        phase_name = data.get("PHASE_NAME", data.get("PHASE", ""))
        start = data.get("PHASE_START_DATE", data.get("SESTDTC", data.get("START_DATE")))
        if "GESTATION" in phase_name.upper() or _design_value(data, "STUDY_TYPE", "STUDY_DESIGN").upper() in {"EFD", "EMBRYO-FETAL DEVELOPMENT"}:
            start = _design_value(data, "CONFIRMED_MATING_DATE", "MATING_DATE", "GESTATION_START_DATE") or start
        end = data.get("NEXT_PHASE_START_DATE", data.get("SEENDTC", data.get("END_DATE")))
        element_type = data.get("ELEMENT_TYPE", "PHASE")
        if not subject or not start or not phase_name:
            continue
        matched = [item for item in definitions if item["source"] is data]
        for definition in matched or [{"etcd": data.get("ETCD", phase_name), "element": phase_name,
                           "type": element_type, "TESTRL": data.get("TESTRL", ""),
                           "TEENRL": data.get("TEENRL", ""), "TEDUR": data.get("TEDUR", "")}]:
            generated.append(RawMeasurement(study_id=study_id, measurement_type="SE", source_filename="generated-from-anm-phase",
                            row_data={"SEDDM_ID": data.get("SEDDM_ID"), "USUBJID": data.get("USUBJID"),
                                  "SESEQ": len(generated) + 1, "ETCD": definition["etcd"],
                                  "ELEMENT": definition["element"], "ELEMENT_TYPE": definition["type"],
                                  "TESTRL": definition.get("TESTRL", ""), "TEENRL": definition.get("TEENRL", ""),
                                  "TEDUR": definition.get("TEDUR", ""), "SESTDTC": start, "SEENDTC": end,
                                  "TREATMENT": data.get("TREATMENT", data.get("DOSE_REGIMEN", ""))}))
    db.add_all(generated)
    return generated

async def _generate_death_diagnoses(study_id: uuid.UUID, db: AsyncSession) -> int:
    from app.models.domain import RawMeasurement
    dm_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "DM"))
    mi_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "MI"))
    dm_rows = dm_result.scalars().all()
    mi_rows = mi_result.scalars().all()
    dead_animals = {str(row.row_data.get("SEDDM_ID") or row.row_data.get("USUBJID") or row.row_data.get("SUBJID"))
                   for row in dm_rows if str(row.row_data.get("DIED", row.row_data.get("DEAD", ""))).upper() in {"Y", "YES", "TRUE", "1"}
                   and str(row.row_data.get("DEATH_TYPE", row.row_data.get("DEATH_STATUS", ""))).upper() in {"UNSCHEDULED", "UNSCHEDULED DEATH", "U"}}
    if not dead_animals:
        return 0
    existing_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "DD"))
    for existing in existing_result.scalars().all():
        await db.delete(existing)
    created = 0
    created_by_animal: set[str] = set()
    for mi in mi_rows:
        key = str(mi.row_data.get("SEDDM_ID") or mi.row_data.get("USUBJID") or mi.row_data.get("SUBJID"))
        if key not in dead_animals or str(mi.row_data.get("UNSCHEDULED_DEATH", mi.row_data.get("DEATH_TYPE", ""))).upper() not in {"Y", "UNSCHEDULED"}:
            continue
        tissue = str(mi.row_data.get("TISSUE", mi.row_data.get("MISPEC", ""))).strip()
        if settings.PRIMARY_CAUSE_OF_DEATH_DB == "1" and (key in created_by_animal or str(mi.row_data.get("PRIMARY_CAUSE_OF_DEATH", mi.row_data.get("PRIMARY_CAUSE", ""))).upper() not in {"Y", "YES", "TRUE", "1"}):
            continue
        if settings.PRIMARY_CAUSE_OF_DEATH_DB == "0" and tissue.upper() not in {name.strip().upper() for name in settings.DDTissueName.split(",") if name.strip()}:
            continue
        ddorres, ddstres, ddrescat = _dd_finding_values(mi.row_data)
        db.add(RawMeasurement(study_id=study_id, measurement_type="DD", source_filename="generated", row_data={
            "SEDDM_ID": mi.row_data.get("SEDDM_ID"), "DDORRES": ddorres, "DDSTRESC": ddstres, "DDRESCAT": ddrescat}))
        created += 1
        if settings.PRIMARY_CAUSE_OF_DEATH_DB == "1":
            created_by_animal.add(key)
    return created

def _apply_finding_mappings(records: list, domain: str, mappings: list, sendig_version: str) -> None:
    result_key = "MISTRESC" if domain == "MI" else "TFSTRESC"
    distribution_key = "MIDISTR" if domain == "MI" else "TFDISTR" if domain == "TF" else "MADISTR"
    chronicity_key = "MICHRON" if domain == "MI" else "TFCHRON" if domain == "TF" else "MACHRON"
    resmod_key = "MIRESMOD" if domain == "MI" else "TFRESMOD" if domain == "TF" else "MARESMOD"
    for record in records:
        data = dict(record.row_data)
        mapped_result = _mapped_value(mappings, result_key, str(data.get(result_key, data.get("MIORRES" if domain == "MI" else "TFORRES", ""))))
        if mapped_result:
            data[result_key] = mapped_result
        category_key = "MIRESCAT" if domain == "MI" else "TFRESCAT"
        mapped_category = _mapped_value(mappings, category_key, str(data.get(category_key, "")))
        if mapped_category:
            data[category_key] = mapped_category
        for variable, key in ((distribution_key, distribution_key), (chronicity_key, chronicity_key)):
            mapped_modifier = _mapped_value(mappings, variable, str(data.get(key, "")))
            if mapped_modifier and mapped_modifier not in str(data.get(key, "")):
                data[key] = "; ".join(filter(None, (mapped_modifier, str(data.get(key, "")).strip())))
        mapped_resmod = _mapped_value(mappings, "RESMOD_SUBVAL", str(data.get(resmod_key, data.get("RESMOD", ""))))
        if mapped_resmod:
            if sendig_version.startswith("3.0"):
                data.setdefault("SUPPQUAL", {})[resmod_key] = mapped_resmod
            else:
                data[resmod_key] = mapped_resmod
        composed_resmod = _compose_resmod(data, domain, mappings, sendig_version)
        if composed_resmod:
            data[resmod_key] = composed_resmod
        if domain == "TF" and data.get(distribution_key):
            data[resmod_key] = "; ".join(filter(None, (str(data.get(distribution_key)).strip(), str(data.get(resmod_key, "")).strip())))
        if domain == "MI" and sendig_version.startswith("3.0") and data.get(distribution_key):
            data[resmod_key] = "; ".join(filter(None, (str(data.get(distribution_key)).strip(), str(data.get(resmod_key, "")).strip())))
        if sendig_version.startswith("3.0"):
            for key in (distribution_key, chronicity_key):
                if data.get(key):
                    data.setdefault("SUPPQUAL", {})[key] = data.pop(key)
        record.row_data = data

def _apply_finding_type_categories(records: list) -> None:
    """Build MIRESCAT from finding+neoplasm and TFRESCAT from neoplasm only."""
    for record in records:
        domain = record.measurement_type.upper()
        data = dict(record.row_data)
        if domain == "MI":
            finding = _design_value(data, "MIFINDINGTYPE", "FINDING_TYPE")
            neoplasm = _design_value(data, "MINEOTYPE", "NEOPLASM_TYPE")
            category = ", ".join(filter(None, (finding, neoplasm)))
            if category:
                data["MIRESCAT"] = category
        elif domain == "TF":
            neoplasm = _design_value(data, "TFNEOTYPE", "MINEOTYPE", "NEOPLASM_TYPE")
            if neoplasm:
                data["TFRESCAT"] = neoplasm
        record.row_data = data

def _apply_tissue_mappings(records: list, mappings: list) -> None:
    """Map one source tissue to multiple SEND tissue-related variables."""
    for record in records:
        domain = record.measurement_type.upper()
        prefix = domain
        if domain not in {"LB", "MA", "MI", "OM", "TF"}:
            continue
        data = dict(record.row_data)
        source = _design_value(data, "TISSUE", f"{prefix}SPEC", f"{prefix}LOC")
        if not source:
            continue
        for target in (f"{prefix}SPEC", f"{prefix}ANTREG", f"{prefix}LAT", f"{prefix}DIR",
                       f"{prefix}PORTOT", f"{prefix}METHOD", f"{prefix}SPCCND", "FOCID"):
            if data.get(target):
                continue
            mapped = _mapped_value(mappings, target, source)
            if mapped:
                data[target] = mapped
        record.row_data = data

class TransformRequest(BaseModel):
    domain_codes: List[str]
    output_format: str = "XPT"  # XPT | CSV - Untransformed | CSV | XML  (FS23/FS27)
    sendig_version: str = "3.1"
    output_dart_version: str = ""

async def _generate_supplb_lbcalcn(study_id: uuid.UUID, db: AsyncSession) -> None:
    """Create SUPPLB LBCALCN rows for signed LB results with numeric interpretations."""
    generated = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "SUPPLB",
        RawMeasurement.source_filename == "generated-lbcalcn"))
    for record in generated.scalars().all():
        await db.delete(record)
    result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "LB"))
    for index, record in enumerate(result.scalars().all(), start=1):
        data = record.row_data
        numeric_value = data.get("NUMERICAL_VALUE")
        if numeric_value is None or data.get("LBSTRESN") is not None or data.get("CODED_COMMENT") is not None:
            continue
        lbseq = data.get("LBSEQ") or record.record_id or str(index)
        db.add(RawMeasurement(
            study_id=study_id, measurement_type="SUPPLB", source_filename="generated-lbcalcn",
            idvar="LBSEQ", idvarval=str(lbseq), r_domain="LB",
            row_data={"STUDYID": data.get("STUDYID", str(study_id)), "RDOMAIN": "LB",
                      "USUBJID": data.get("USUBJID", ""), "POOLID": data.get("POOLID", ""),
                      "IDVAR": "LBSEQ", "IDVARVAL": str(lbseq), "QNAM": "LBCALCN",
                      "QLABEL": "Numeric Interpretation for Calculations", "QVAL": str(numeric_value),
                      "QORIG": "DERIVED", "QEVAL": ""},
        ))

@router.get("/domains", summary="FS27 – Full list of SEND domains")
async def list_send_domains(_=Depends(get_current_user)):
    domain_labels = {
        "TS":"Trial Summary","TE":"Trial Elements","SE":"Subject Elements","TA":"Trial Arms","TT":"Trial Stages","TP":"Trial Paths","SS":"Subject Stages",
        "TX":"Trial Sets","DM":"Demographics","BW":"Body Weights","MI":"Microscopic Findings",
        "SC":"Subject Characteristics","DS":"Disposition","DD":"Death Diagnosis",
        "MA":"Macroscopic Findings","TF":"Tumor Findings","BG":"Body Weight Gains",
        "OM":"Organ Measurements","CL":"Clinical Observations","FW":"Food/Water Consumption",
        "PM":"Palpable Masses","LB":"Laboratory Results","EX":"Exposure","VS":"Vital Signs",
        "EG":"ECG Results","RE":"Respiratory Results","CV":"Cardiovascular Results",
        "IC":"Implantation Classification","FM":"Fetal Measurements","PY":"Nonclinical Pregnancy",
        "FX":"Fetal Pathology","DP":"Developmental Milestone",
    }
    return [{"code": c, "label": domain_labels.get(c, c), "source_information": SEND_DOMAIN_CATALOG.get(c, ("", "", ""))[0], "domain_algorithm": SEND_DOMAIN_CATALOG.get(c, ("", "", ""))[1], "special_algorithm": SEND_DOMAIN_CATALOG.get(c, ("", "", ""))[2]} for c in SEND_DOMAINS]

@router.post("/{study_id}/run", response_model=TaskResponse, summary="FS23 – Generate SEND domains")
async def run_transformation(study_id: uuid.UUID, body: TransformRequest,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    from app.models.domain import RawMeasurement
    study = await db.get(Study, study_id)
    if not study: raise HTTPException(status_code=404, detail="Study not found")
    from app.models.domain import StudyFocusMapping, OutputMapping
    focus_result = await db.execute(select(StudyFocusMapping).where(StudyFocusMapping.study_id == study_id))
    focus_mappings = list(focus_result.scalars().all())
    if focus_mappings:
        focus_domains = ("EX", "CL", "MA", "MI", "TF")
        focus_records_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(focus_domains)))
        focus_records: dict[str, list] = {}
        for record in focus_records_result.scalars().all():
            focus_records.setdefault(record.measurement_type.upper(), []).append(record)
        output_result = await db.execute(select(OutputMapping).where(
            OutputMapping.study_id == study_id, OutputMapping.domain_code == "TF",
            OutputMapping.send_variable == "FOCID"))
        apply_focid_mappings(focus_records, focus_mappings, bool(output_result.scalars().first()))
        await db.commit()
    await _resolve_stored_relrec(study_id, db, body.sendig_version)
    await db.commit()
    comment_domains = [domain for domain in ("MI", "MA", "OM", "CL", "LB", "PM") if domain in body.domain_codes]
    if comment_domains:
        await _generate_comment_records(study_id, db, comment_domains)
        await db.commit()
    if "DP" in body.domain_codes and "BW" in body.domain_codes:
        await _generate_dp_bw_relrec(study_id, db)
        await db.commit()
    if "LB" in body.domain_codes:
        await _generate_supplb_lbcalcn(study_id, db)
        await db.commit()
    if "MA" in body.domain_codes:
        await _generate_ma_followups(study_id, db)
        pm_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "PM"))
        ma_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "MA"))
        pm_rows = [row.row_data for row in pm_result.scalars().all()]
        for ma in ma_result.scalars().all():
            ma.row_data = _set_mass_id(ma.row_data, pm_rows, "MASPID")
        await db.commit()
    if "FW" in body.domain_codes:
        fw_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "FW"))
        fw_records = _normalize_fw_records(list(fw_result.scalars().all()), study.connection_type)
        phase_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(["ANM_PHASE", "ANIMAL_PHASE"])))
        dm_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "DM"))
        ds_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "DS"))
        pool_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "POOLDEF",
            RawMeasurement.source_filename == "generated-fw-pooldef"))
        for pool in pool_result.scalars().all():
            await db.delete(pool)
        db.add_all(_apply_fw_pool_ids(study_id, fw_records,
                                      [row.row_data for row in phase_result.scalars().all()],
                                      [row.row_data for row in dm_result.scalars().all()],
                                      [row.row_data for row in ds_result.scalars().all()]))
        await db.commit()
    if "DD" in body.domain_codes:
        await _generate_death_diagnoses(study_id, db)
        await db.commit()
    if "BG" in body.domain_codes and study.connection_type not in {"CSV", "SEND_DATASET"}:
        existing_bg = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "BG",
            RawMeasurement.source_filename == "generated-from-bw"))
        for existing in existing_bg.scalars().all():
            await db.delete(existing)
        bw_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "BW"))
        _calculate_bg_records(study_id, list(bw_result.scalars().all()), db)
        await db.commit()
    if "SE" in body.domain_codes and study.connection_type == "PRISTIMA_API":
        phase_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(["ANM_PHASE", "ANIMAL_PHASE"])))
        se_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "SE"))
        _generate_pristima_subject_elements(study_id, list(phase_result.scalars().all()), list(se_result.scalars().all()), db)
        await db.commit()
    if "TA" in body.domain_codes and study.connection_type == "PRISTIMA_API":
        phase_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(["ANM_PHASE", "ANIMAL_PHASE"])))
        ta_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "TA"))
        _generate_pristima_trial_arms(study_id, list(phase_result.scalars().all()), list(ta_result.scalars().all()), db)
        await db.commit()
    if "TX" in body.domain_codes and study.connection_type == "PRISTIMA_API":
        phase_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(["ANM_PHASE", "ANIMAL_PHASE"])))
        tx_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "TX"))
        await _generate_pristima_trial_sets(study_id, list(phase_result.scalars().all()), list(tx_result.scalars().all()), db)
        await db.commit()
    if "TT" in body.domain_codes and study.connection_type == "PRISTIMA_API":
        phase_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(["ANM_PHASE", "ANIMAL_PHASE"])))
        tt_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "TT"))
        await _generate_pristima_trial_stages(study_id, list(phase_result.scalars().all()), list(tt_result.scalars().all()), db)
        await db.commit()
    if "TP" in body.domain_codes and study.connection_type == "PRISTIMA_API":
        phase_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(["ANM_PHASE", "ANIMAL_PHASE"])))
        tp_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "TP"))
        await _generate_pristima_trial_paths(study_id, list(phase_result.scalars().all()), list(tp_result.scalars().all()), db)
        await db.commit()
    if "SS" in body.domain_codes and study.connection_type == "PRISTIMA_API":
        phase_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(["ANM_PHASE", "ANIMAL_PHASE"])))
        ss_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "SS"))
        generated_existing = [row for row in ss_result.scalars().all() if row.source_filename == "generated-from-study-design"]
        for row in generated_existing:
            await db.delete(row)
        records = [RawMeasurement(study_id=study_id, measurement_type="SS", source_filename="generated-from-study-design", row_data=row)
                   for row in _subject_stage_records(study_id, [item.row_data for item in phase_result.scalars().all()])]
        db.add_all(records)
        await db.commit()
    if "SC" in body.domain_codes and study.connection_type == "PRISTIMA_API":
        phase_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(["ANM_PHASE", "ANIMAL_PHASE"])))
        dm_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "DM"))
        sc_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "SC"))
        for row in sc_result.scalars().all():
            if row.source_filename == "generated-juvenile-litterid":
                await db.delete(row)
        design_rows = [item.row_data for item in phase_result.scalars().all()] + [item.row_data for item in dm_result.scalars().all()]
        records = [RawMeasurement(study_id=study_id, measurement_type="SC", source_filename="generated-juvenile-litterid", row_data=row)
                   for row in _juvenile_litterid_records(study_id, design_rows, body.output_dart_version)]
        db.add_all(records)
        await db.commit()
    if "DM" in body.domain_codes and study.connection_type == "PRISTIMA_API" and "DART" in (study.study_type or "").upper():
        phase_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(["ANM_PHASE", "ANIMAL_PHASE"])))
        tp_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "TP"))
        dm_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "DM"))
        phase_rows = [item.row_data for item in phase_result.scalars().all()]
        path_rows = [item.row_data for item in tp_result.scalars().all()]
        path_rows = path_rows or _trial_path_records(study_id, phase_rows)
        _apply_dart_paths(list(dm_result.scalars().all()), path_rows)
        await db.commit()
    if "MI" in body.domain_codes or "TF" in body.domain_codes:
        from app.models.domain import CTMapping
        if "TF" in body.domain_codes and study.connection_type not in {"CSV", "SEND_DATASET"}:
            mi_source = await db.execute(select(RawMeasurement).where(
                RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "MI"))
            tf_source = await db.execute(select(RawMeasurement).where(
                RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "TF"))
            _generate_tf_from_mi(list(mi_source.scalars().all()), list(tf_source.scalars().all()), study_id, db)
            await db.flush()
        pathology_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id,
            RawMeasurement.measurement_type.in_([code for code in ("MI", "TF") if code in body.domain_codes])))
        pathology_records = pathology_result.scalars().all()
        mapping_result = await db.execute(select(CTMapping).where(
            CTMapping.domain_code.in_([code for code in ("MI", "TF") if code in body.domain_codes])))
        finding_mappings = mapping_result.scalars().all()
        for domain in ("MI", "TF"):
            _apply_finding_group_ids([record for record in pathology_records if record.measurement_type == domain], domain)
        for raw in pathology_records:
            domain = raw.measurement_type
            result_key = "MISTRESC" if domain == "MI" else "TFSTRESC"
            finding_key = "MIORRES" if domain == "MI" else "TFORRES"
            group_key = "MIGRPID" if domain == "MI" else "TFGRPID"
            group_id = raw.row_data.get(group_key)
            origin = next((candidate.row_data for candidate in pathology_records
                           if candidate is not raw and candidate.measurement_type == domain
                           and group_id and candidate.row_data.get(group_key) == group_id
                           and not _is_metastatic_finding(candidate.row_data, domain)), None)
            result, standardized = _format_metastatic_result(raw.row_data, origin, domain)
            prepared = _prepare_pathology_components({**raw.row_data, finding_key: result, result_key: standardized}, domain)
            raw.row_data = _apply_death_relations(prepared, domain)
        _apply_finding_type_categories(pathology_records)
        for domain in ("MI", "TF"):
            _apply_finding_mappings([record for record in pathology_records if record.measurement_type == domain], domain, finding_mappings, body.sendig_version)
        await db.commit()
    if "TF" in body.domain_codes and study.connection_type not in {"CSV", "SEND_DATASET"}:
        all_measurements = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id))
        measurement_by_domain: dict[str, list] = {}
        for measurement in all_measurements.scalars().all():
            measurement_by_domain.setdefault(measurement.measurement_type, []).append(measurement)
        _populate_tfdetect(measurement_by_domain.get("TF", []), measurement_by_domain)
        await db.commit()
    if any(domain in body.domain_codes for domain in ("PM", "MA", "MI", "CL")):
        recid_result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id))
        _apply_recids(list(recid_result.scalars().all()), study.connection_type)
        await db.commit()
        await _generate_correlation_relrec(study_id, db)
        await db.commit()
    await _generate_api_supplemental(study_id, db, study.connection_type,
                                     [domain for domain in body.domain_codes if domain in {"BW", "FW", "CL", "EX", "LB", "MA", "MI", "TF"}])
    await db.commit()
    if "EX" in body.domain_codes:
        if study.connection_type == "PRISTIMA_API":
            await _generate_indirect_ex_records(study_id, db)
            await db.commit()
        ex_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "EX"))
        _apply_ex_dosing_specifications(list(ex_result.scalars().all()))
        await db.commit()
        ex_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "EX"))
        for record in ex_result.scalars().all():
            record.row_data = normalize_inhalation_exposure(record.row_data)
        await db.commit()
    phase_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_(["ANM_PHASE", "ANIMAL_PHASE"])))
    phase_rows = [row.row_data for row in phase_result.scalars().all()]
    all_result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id))
    _apply_reference_dates_and_study_days(list(all_result.scalars().all()), phase_rows)
    refreshed_result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id))
    _apply_visit_days(list(refreshed_result.scalars().all()), phase_rows, study.connection_type)
    nominal_result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id))
    _apply_interval_and_nominal_days(list(nominal_result.scalars().all()), phase_rows, study_id)
    phase_day_result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id))
    _apply_phase_day_variables(list(phase_day_result.scalars().all()), phase_rows)
    status_result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id))
    _apply_not_taken_flags(list(status_result.scalars().all()))
    om_result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "OM"))
    bw_result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "BW"))
    om_records = list(om_result.scalars().all())
    _apply_organ_weight_ratios(om_records, list(bw_result.scalars().all()), study_id)
    long_text_result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id))
    long_text_records = list(long_text_result.scalars().all())
    for record in long_text_records:
        if record.measurement_type.upper().startswith("SUPP") and record.source_filename == "generated-long-text":
            await db.delete(record)
    db.add_all(_apply_long_text_rules(long_text_records, study_id))
    await db.commit()
    output_result = await db.execute(select(RawMeasurement).where(RawMeasurement.study_id == study_id))
    phase_rows_for_filter = phase_rows
    filtered_records = _filter_replaced_records(list(output_result.scalars().all()), phase_rows_for_filter)
    output_records: dict[str, list] = {}
    for record in filtered_records:
        output_records.setdefault(record.measurement_type.upper(), []).append(record)
    from app.models.domain import CTMapping
    tissue_mapping_result = await db.execute(select(CTMapping).where(
        CTMapping.domain_code.in_(["LB", "MA", "MI", "OM", "TF"])))
    tissue_mappings = tissue_mapping_result.scalars().all()
    for domain in ("LB", "MA", "MI", "OM", "TF"):
        _apply_tissue_mappings(output_records.get(domain, []), tissue_mappings)
    if any(domain in body.domain_codes for domain in ("EX", "CL", "MA", "MI", "LB", "PC", "PP", "RE", "CE", "VS", "EG")):
        apply_inhalation_postdose_precision(output_records, output_records.get("EX", []))
        apply_anatomical_region_rules(output_records, body.sendig_version)
        await db.commit()
    required_variables = {"EX": ("EXTRT", "EXDOSE", "EXSTDTC"), "LB": ("LBTESTCD", "LBORRES", "LBDTC"),
                          "CL": ("CLTESTCD", "CLDTC"), "MA": ("MASEQ", "MASTRESC"),
                          "MI": ("MISEQ", "MISTRESC"), "SC": ("SCSEQ",)}
    for domain in body.domain_codes:
        records = output_records.get(domain, [])
        required = required_variables.get(domain, ())
        missing = sorted(variable for variable in required if not any(variable in record.row_data for record in records))
        null_required = sorted({variable for variable in required for record in records
                                if variable in record.row_data and not record.row_data.get(variable)})
        ct_missing = sorted({variable for variable in ("EXROUTE", "EXDOSU", "LBSTRESC", "CLSTRESC")
                             if any(variable in record.row_data and not record.row_data.get(variable) for record in records)})
        write_domain_log(study_id, {"event": "domain_output", "user": current_user.get("sub"),
                        "domain": domain, "records": len(records), "missing_required": missing,
                        "null_required": null_required, "ct_missing_submission_value": ct_missing,
                        "output_format": body.output_format})
    derived_fields = {}
    if "DM" in body.domain_codes and study.connection_type == "PRISTIMA_API":
        result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "EX"))
        exposure_rows = [row.row_data for row in result.scalars().all()
                 if str(row.row_data.get("PHASE", row.row_data.get("EPOCH", ""))).upper()
                 not in {"PRETEST", "PRETEST MATING", "PRETEST_MATING"}]
        start_dates = [row.get("EXSTDTC", "") for row in exposure_rows if row.get("EXSTDTC")]
        end_dates = [row.get("EXENDTC") or row.get("EXSTDTC", "") for row in exposure_rows if row.get("EXENDTC") or row.get("EXSTDTC")]
        if start_dates:
            derived_fields["RFXSTDTC"] = min(start_dates)
        if end_dates:
            derived_fields["RFXENDTC"] = max(end_dates)
    from app.workers.tasks import transform_domains_task
    task = transform_domains_task.delay(str(study_id), body.domain_codes, body.output_format, current_user.get("sub"), derived_fields)
    return TaskResponse(task_id=task.id, status="queued", message=f"Transformation queued: {', '.join(body.domain_codes)} → {body.output_format}")

@router.get("/{study_id}/domains")
async def list_study_domains(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy import select
    from app.models.domain import Domain
    result = await db.execute(select(Domain).where(Domain.study_id == study_id).order_by(Domain.domain_code))
    return [{"id":str(d.id),"domain_code":d.domain_code,"domain_label":d.domain_label,"record_count":d.record_count,"status":d.status,"validation_errors":d.validation_errors,"validation_warnings":d.validation_warnings,"generated_at":d.generated_at} for d in result.scalars().all()]

@router.get("/{study_id}/pc-pp-shell/{domain_code}", summary="FS27.8.2 – Generate untransformed PC/PP shell")
async def generate_pk_shell(study_id: uuid.UUID, domain_code: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from app.models.study import Study
    from app.models.domain import SampleCollection
    domain = domain_code.upper()
    if domain not in {"PC", "PP"}:
        raise HTTPException(status_code=422, detail="Shell generation supports PC or PP only.")
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    result = await db.execute(select(SampleCollection).where(SampleCollection.study_id == study_id))
    names = {name.strip().upper() for name in settings.PC_PP_ANALYSIS_NAMES.split(",") if name.strip()}
    samples = [sample.data for sample in result.scalars().all()
               if str(sample.data.get("SAMPLE_ANALYSIS_TYPE", "")).upper() == "PK"
               or str(sample.data.get("ANALYSIS_ST_NAME", "")).strip().upper() in names]
    prefix = "PC" if domain == "PC" else "PP"
    fields = ["STUDYID", "USUBJID", "POOLID", f"{prefix}REFID", f"{prefix}DTC", f"{prefix}DY",
              "VISITDY", "RPHASE", "RPPLDY", f"{prefix}RPDY", f"{prefix}NOMDY", f"{prefix}NOMLBL",
              f"{prefix}ENDTC", "TPTNUM", f"{prefix}SPEC", f"{prefix}ELTM", f"{prefix}TPT",
              f"{prefix}RFTDTC", f"{prefix}TPTREF", f"{prefix}EVINT", f"{prefix}STAT", f"{prefix}REASND"]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for sample in samples:
        row = {"STUDYID": sample.get("SEDTS_ID", str(study.id)), "USUBJID": sample.get("SEDDM_ID", sample.get("USUBJID", "")),
               "POOLID": sample.get("POOLID", ""), f"{prefix}REFID": sample.get("SAMPLE_KEY", ""),
               f"{prefix}DTC": sample.get("ST_DATE_TAKEN", ""), "VISITDY": sample.get("VISITDY", ""),
               "RPHASE": sample.get("PHASE_NAME", ""), "RPPLDY": sample.get("DAYOFPHASE", ""),
               f"{prefix}SPEC": sample.get("ANALYSIS_ST_NAME", ""), f"{prefix}ELTM": sample.get("PLANNED_ELAPSED_TIME", sample.get("SESSION_NAME", "")),
               f"{prefix}TPT": sample.get("TIME_POINT_TEXT", sample.get("SESSION_NAME", "")),
               f"{prefix}RFTDTC": sample.get("DOSING_DATE_TIME", ""), f"{prefix}TPTREF": sample.get("DOSE_REFERENCE_TEXT", ""),
               f"{prefix}STAT": sample.get("STATUS", ""), f"{prefix}REASND": sample.get("REASON_NOT_TAKEN", "")}
        writer.writerow(row)
    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f'attachment; filename="{domain}.csv"'
    return response
