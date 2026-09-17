"""FS10/FS11/FS13 – Study Load and raw measurement editing"""
import csv
import io
import asyncio
import os
import re
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import APIRouter, Body, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.security import get_current_user
from app.db.session import get_db
from app.schemas.study import TaskResponse
from app.models.domain import RawMeasurement, SampleCollection
from app.core.config import settings
from app.core.logging import write_session_log

router = APIRouter()

STAT_COLUMNS = {"FW": "FWSTAT", "BW": "BWSTAT", "CL": "CLSTAT"}
PARENT_COLUMNS = {"PARENT", "PARENTID", "PARENT_ID", "PARENT_RECORD_ID", "PARENTRECORDID"}
POOL_IDENTIFIER_COLUMNS = {"POOLID", "USUBJID"}
NULLFLAVOR_CODES = {"NI", "INV", "OTH", "PINF", "NINF", "UNC", "DER", "UNK", "ASKU", "NAV", "NASK", "QS", "TRC", "MSK", "NA"}
LB_RANGE_VARIABLES = ("LBORNRHI", "LBORNRLO", "LBSTNRHI", "LBSTNRLO", "LBSTNRC", "LBNRIND")

def _module_letters(value: str) -> set[str]:
    return {letter.strip().upper() for letter in value.split(",") if letter.strip()}

def measurement_selection_policy(connection_type: str, measurement: dict[str, Any]) -> dict[str, Any]:
    """Return FS13 eligibility and default domain for a source measurement."""
    name = str(measurement.get("measurement_name", measurement.get("name", ""))).strip().lower()
    module_letter = str(measurement.get("module_letter", measurement.get("module", ""))).strip().upper()
    generalized = "generalized" in name
    juvenile_weaning = settings.JUVENILE_WEANING_DAY_MEASUREMENT_NAME.strip().lower() in name
    sample_subject = bool(measurement.get("sample_subject") or measurement.get("subject_type", "").upper() == "SAMPLE")
    animal_subject = bool(measurement.get("animal_subject", measurement.get("subject_type", "").upper() == "ANIMAL"))
    source = connection_type.upper()
    if source == "PRISTIMA_API":
        if juvenile_weaning:
            return {"eligible": True, "default_domain": "SC", "reason": "Approved juvenile weaning-day data loads to SC."}
        eligible = not (generalized and (sample_subject or not animal_subject))
        return {"eligible": eligible, "default_domain": "LB" if sample_subject else None,
                "reason": "Sample-subject generalized data loads to LB." if sample_subject else
                          "Non-animal generalized measurements are excluded." if generalized and not animal_subject else None}
    if source in {"OPENVMS", "CSV", "SEND_DATASET"} and generalized:
        lb_letters = _module_letters(settings.LBModuleLetter)
        eg_letters = _module_letters(settings.EGModuleLetter)
        vs_letters = _module_letters(settings.VSModuleLetter)
        eligible_domains = []
        if module_letter in lb_letters: eligible_domains.append("LB")
        if module_letter in eg_letters: eligible_domains.append("EG")
        if module_letter in vs_letters: eligible_domains.append("VS")
        return {"eligible": "LB" not in eligible_domains, "default_domain": eligible_domains[0] if eligible_domains else None,
                "eligible_domains": eligible_domains,
                "reason": "This generalized measurement is assigned to the LB domain." if "LB" in eligible_domains else None}
    return {"eligible": True, "default_domain": None, "eligible_domains": []}

def normalize_juvenile_weaning_rows(rows: list[dict[str, str]], juvenile_study: bool = True) -> list[dict[str, str]]:
    """Keep one approved Juvenile Weaning Day SC record per juvenile animal."""
    if not juvenile_study:
        return rows
    measurement_name = settings.JUVENILE_WEANING_DAY_MEASUREMENT_NAME.strip().upper()
    selected = [row for row in rows if measurement_name in _first_value(row, "MEASUREMENT_NAME", "MEASUREMENT", "TEST_NAME").upper()]
    if not selected:
        return rows
    approved = [row for row in selected if _first_value(row, "APPROVED", "APPROVAL_STATUS", "STATUS").upper() in {"", "Y", "YES", "APPROVED", "TRUE", "1"}]
    unique = []
    seen = set()
    for row in approved:
        animal = _first_value(row, "USUBJID", "SUBJID", "SEDDM_ID", "ANIMAL_ID")
        if animal.upper() in seen:
            continue
        seen.add(animal.upper())
        unique.append(row)
    return unique
MI_STATUS_NAMES = {
    "0": "No Status", "1": "Autolytic, not readable", "2": "Inadequate", "3": "Missing",
    "203": "One of pair missing", "204": "Both missing", "4": "Not required",
    "6": "Adequate, not in section", "7": "Autolytic, readable",
    "8": "Adequate, not in section and Autolytic, readable", "100": "Recut Requested",
    "101": "Recut Requested and Autolytic, not readable", "102": "Recut Requested and Inadequate",
    "103": "Recut Requested and Missing", "104": "Recut Requested and Not required",
    "106": "Recut Requested and Adequate, not in section", "107": "Recut Requested and Autolytic, readable",
    "108": "Recut Requested and Adequate, not in section and Autolytic, readable",
}

def _load_type_definitions() -> tuple[dict[str, str], set[str], dict[str, str]]:
    path = Path(__file__).resolve().parents[4] / "Application" / "TypeDefinition.properties"
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    names = {key.removeprefix("MI_STATUS_"): value for key, value in values.items() if key.startswith("MI_STATUS_") and key != "MI_STATUS_ALLOWS_FINDING"}
    allows = set(values.get("MI_STATUS_ALLOWS_FINDING", "0,6,7,8").split(","))
    return names, allows, values

MI_STATUS_NAMES, MI_STATUS_ALLOWS_FINDING, TYPE_DEFINITIONS = _load_type_definitions()

def _mi_status_code(data: dict[str, str]) -> str:
    status = _first_value(data, "PRISTIMA_STATUS_NAME", "STATUS_NAME", "PT_STATUS", "PT_STATUS_NAME", "PT_STA", "STATUS")
    if status in MI_STATUS_NAMES:
        return status
    return next((code for code, name in MI_STATUS_NAMES.items() if name.upper() == status.upper()), "")

def _normalize_mi_status(data: dict[str, str]) -> None:
    status_code = _mi_status_code(data)
    if not status_code:
        return
    name = MI_STATUS_NAMES[status_code]
    data["MISTAT"] = "NOT DONE" if status_code != "0" else data.get("MISTAT", "")
    data["MIREASND"] = name
    data["COMMENTS"] = name
    if status_code in {"1", "7", "8", "101", "107", "108"}:
        data["MISPCCND"] = "AUTOLYTIC"
    if status_code in {"1", "101"}:
        data["MISPCUFL"] = "Y"
    if status_code in {"203", "204", "103"}:
        data["MIREASND"] = "One of pair missing" if status_code == "203" else "Both missing" if status_code == "204" else "Missing"
    if status_code == "4" and not any(_is_present(data.get(key)) for key in ("MISTRESC", "MISTRESN", "FINDING", "RESULT")):
        data["MISTRESC"] = "NORMAL"

def _normalize_mi_modifiers(data: dict[str, str]) -> None:
    modifier_type = _first_value(data, "MODIFIER_TYPE", "MODIFIERTYPE", "MODIFIER_CATEGORY")
    modifier_name = _first_value(data, "MODIFIER_NAME", "MODIFIERNAME", "MODIFIER")
    modifier_value = _first_value(data, "MODIFIER_VALUE", "MODIFIERVALUE", "VALUE")
    if modifier_type.upper() == "DISTRIBUTION" and modifier_value:
        data["MIDISTR"] = modifier_value
    elif modifier_type.upper() == "GENERAL" and modifier_name and modifier_value:
        configured_names = {name.strip().upper() for name in settings.CHRONICITY_MODIFIERS.split(",") if name.strip()}
        if modifier_name.upper() in configured_names:
            data["MICHRON"] = modifier_value
    if _is_present(data.get("DISTRIBUTION")) and not _is_present(data.get("MIDISTR")):
        data["MIDISTR"] = data["DISTRIBUTION"].strip()
    if _is_present(data.get("GENERAL")) and not _is_present(data.get("MICHRON")):
        data["MICHRON"] = data["GENERAL"].strip()

def _normalize_reproductive_mi_test(data: dict[str, str]) -> None:
    summary_type = _first_value(data, "SUMMARY_TISSUE_TYPE", "SUMMARYTISSUETYPE", "TISSUE_SUMMARY_TYPE", "SUMMARY_TISSUE", "TISSUE_TYPE", "TISSUETYPE")
    normalized = summary_type.upper().replace("_", " ")
    if "MATURITY" in normalized:
        data["MITESTCD"] = TYPE_DEFINITIONS.get("MI_SUMMARY_TISSUE_MATURITY_TESTCD", "MISXMTQL")
        data["MITEST"] = TYPE_DEFINITIONS.get("MI_SUMMARY_TISSUE_MATURITY_TEST", "Microscopy Sexual Maturity Exam, Qual")
        data["MIRESCAT"] = ""
    elif "CYCLE" in normalized:
        data["MITESTCD"] = TYPE_DEFINITIONS.get("MI_SUMMARY_TISSUE_CYCLE_TESTCD", "STGFCYCL")
        data["MITEST"] = TYPE_DEFINITIONS.get("MI_SUMMARY_TISSUE_CYCLE_TEST", "Repro Cycle Phse, Microscopy, Exam, Qual")
        data["MIRESCAT"] = ""
    elif not normalized or "EMPTY" in normalized:
        data["MITESTCD"] = TYPE_DEFINITIONS.get("MI_SUMMARY_TISSUE_EMPTY_TESTCD", "GHISTXQL")
        data["MITEST"] = TYPE_DEFINITIONS.get("MI_SUMMARY_TISSUE_EMPTY_TEST", "General Histopathologic Exam, Qual")

def _mi_pair_key(data: dict[str, str]) -> str:
    return _first_value(data, "TISSUE_PAIR_ID", "PAIR_TISSUE_ID", "PAIR_ID", "PAIRID", "SEDTIS_ID")

def _consolidate_pristima_mi_pairs(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    grouped: dict[str, list[dict[str, str]]] = {}
    unpaired = []
    for row in rows:
        key = _mi_pair_key(row)
        (grouped.setdefault(key, []) if key else unpaired).append(row)
    output = list(unpaired)
    for pair_rows in grouped.values():
        if len(pair_rows) != 2:
            output.extend(pair_rows)
            continue
        codes = [_mi_status_code(row) for row in pair_rows]
        if codes[0] == codes[1]:
            output.append(pair_rows[0])
            continue
        allows = [code in MI_STATUS_ALLOWS_FINDING for code in codes]
        if all(allows):
            selected = next((row for row, code in zip(pair_rows, codes) if code != "0"), pair_rows[0])
            output.append(selected)
        elif any(allows):
            allowed_row = pair_rows[allows.index(True)]
            if not any(_is_present(allowed_row.get(key)) for key in ("MISTRESC", "MISTRESN", "FINDING", "RESULT")):
                allowed_row = {**allowed_row, "MISTRESC": "NORMAL"}
            output.extend([pair_rows[allows.index(False)], allowed_row])
        else:
            output.extend(pair_rows)
    return output

def _measurement_matches(left: dict[str, Any], right: dict[str, Any]) -> bool:
    subject_keys = ("SEDDM_ID", "USUBJID", "SUBJID")
    subject_matches = any(_is_present(left.get(key)) and _is_present(right.get(key))
                          and str(left[key]).strip().upper() == str(right[key]).strip().upper()
                          for key in subject_keys)
    if not subject_matches:
        return False
    tissue_left = _first_value(left, "SEDTIS_ID", "TISSUE_ID", "TISSUE")
    tissue_right = _first_value(right, "SEDTIS_ID", "TISSUE_ID", "TISSUE")
    return not tissue_left or not tissue_right or tissue_left.upper() == tissue_right.upper()

def _mass_number(data: dict[str, Any]) -> str:
    return _first_value(data, "MASS_NUMBER", "MASSNO", "PMNO", "PMSEQ", "PM_ID")

def _set_mi_mass_ids(mi_rows: list[dict[str, Any]], pm_rows: list[dict[str, Any]]) -> None:
    for mi_row in mi_rows:
        mass_numbers = sorted({_mass_number(pm_row) for pm_row in pm_rows
                               if _measurement_matches(mi_row, pm_row) and _is_present(_mass_number(pm_row))})
        if mass_numbers:
            mi_row["MISPID"] = ",".join(mass_numbers)
SUPPORTED_SUPPLEMENTAL_DOMAINS = {"DM", "BW", "CL", "EX", "LB", "PM", "VS", "EG", "MI", "FW", "OM", "SC", "FM", "PY", "FX", "DP", "DS", "DD", "BG", "MA", "CO"}
UNSUPPORTED_SUPPLEMENTAL_DOMAINS = {"TS", "TA", "TE", "TX"}
PRIMARY_KEY_COLUMNS = {"BW": "SEDBW_ID", "MI": "SEDMI_ID", "MA": "SEDMI_ID", "TF": "SEDMI_ID",
                       "CL": "SEDCL_ID", "DM": "SEDDM_ID", "DS": "SEDDS_ID", "EG": "SEDEG_ID",
                       "EX": "SEEEX_ID", "FW": "SEDFF_ID", "LB": "SEDLB_ID", "PM": "SEDPM_ID",
                       "VS": "SEDVS_ID", "OM": "SEDOM_ID", "SC": "SEDSC_ID", "FM": "SEDFM_ID",
                       "PY": "SEDPY_ID", "DP": "SEDDP_ID"}
RECORD_ID_SEQUENCE_COLUMNS = {"BW": "BWSEQ", "CL": "CLSEQ", "EX": "EXSEQ", "LB": "LBSEQ",
                              "PM": "PMSEQ", "VS": "VSSEQ", "EG": "EGSEQ", "MI": "MISEQ",
                              "FW": "FWSEQ", "DS": "DSSEQ", "OM": "OMSEQ"}

def _load_domain_keys() -> dict[str, tuple[str, ...]]:
    path = Path(__file__).resolve().parents[4] / "Application" / "DomainKeys.properties"
    if not path.exists():
        return {}
    keys = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            name, values = line.split("=", 1)
            keys[name.strip().upper()] = tuple(value.strip().upper() for value in values.split(",") if value.strip())
    return keys

DOMAIN_KEYS = _load_domain_keys()

def _configured_keys(domain: str, data: dict[str, Any]) -> tuple[str, ...]:
    if domain == "MI":
        variant = str(data.get("DOMAIN", "")).upper()
        return DOMAIN_KEYS.get(f"SEND_MI.{variant}", DOMAIN_KEYS.get("SEND_MI.MA", ()))
    return DOMAIN_KEYS.get(f"SEND_{domain}", ())

def _key_tuple(keys: tuple[str, ...], data: dict[str, Any]) -> Optional[tuple[str, ...]]:
    values = tuple(str(data.get(key, "")).strip().upper() for key in keys)
    return values if values and all(values) else None

def _record_id_for(domain: str, data: dict[str, Any], source_type: str) -> Optional[str]:
    if domain == "DS":
        return None
    if source_type == "PRISTIMA_API":
        for key in ("RECID", "RECORD_ID", f"{domain}_RECORD_ID", f"{domain}ID", f"SED{domain}_ID"):
            if _is_present(data.get(key)):
                return str(data[key]).strip()
        return None
    if source_type not in {"CSV", "SEND_DATASET"}:
        return None
    sequence_column = RECORD_ID_SEQUENCE_COLUMNS.get(domain, f"{domain}SEQ")
    if domain == "MI" and not _is_present(data.get(sequence_column)):
        sequence_column = "MASEQ"
    value = data.get(sequence_column)
    return str(value).strip() if _is_present(value) else None

def _is_generated_supplemental_row(data: dict[str, Any]) -> bool:
    return str(data.get("GENERATED_FROM_MAIN", data.get("DERIVED_FROM_MAIN", ""))).upper() in {"Y", "YES", "TRUE", "1"}

def _supplemental_link(domain: str, data: dict[str, str], main_records: dict[str, Any], key_records: dict[tuple[str, ...], Any], source_type: str) -> tuple[str, str]:
    sequence_column = RECORD_ID_SEQUENCE_COLUMNS.get(domain, f"{domain}SEQ")
    explicit_idvar = data.get("IDVAR", "").strip()
    if explicit_idvar:
        if source_type == "PRISTIMA_API" and explicit_idvar.upper() == sequence_column:
            sequence_value = data.get(sequence_column, data.get("IDVARVAL", "")).strip()
            main = main_records.get(sequence_value)
            if not main:
                main = key_records.get(_key_tuple(_configured_keys(domain, data), data))
            return explicit_idvar, str(main.id) if main else sequence_value
        return explicit_idvar, data.get("IDVARVAL", "").strip()
    sequence_value = data.get(sequence_column, "").strip()
    if domain == "MI" and not sequence_value:
        sequence_column = "MASEQ"
        sequence_value = data.get(sequence_column, "").strip()
    if sequence_value:
        main = main_records.get(sequence_value)
        if not main:
            main = key_records.get(_key_tuple(_configured_keys(domain, data), data))
        return sequence_column, str(main.id) if main else sequence_value
    candidate = next((key for key, value in data.items()
                      if _is_present(value) and key.upper() in {f"{domain}REFID", f"{domain}RXXX"}
                      ), None)
    if not candidate:
        candidate = next((key for key, value in data.items()
                          if _is_present(value) and key.upper().startswith(domain)
                          and key.upper() not in {"ACTION", "IDVAR", "IDVARVAL"}
                          and not key.upper().endswith("SEQ")), None)
    return (candidate, data.get(candidate, "").strip()) if candidate else ("", "")

def _is_present(value: Any) -> bool:
    return value is not None and str(value).strip() != ""

def _first_value(data: dict[str, str], *names: str) -> str:
    for name in names:
        value = data.get(name)
        if _is_present(value):
            return str(value).strip()
    return ""

def _sample_key(data: dict[str, str]) -> str:
    return _first_value(data, "SAMPLE_KEY", "SAMPLEKEY", "PCREFID", "PPREFID")

def _lb_sample_key(data: dict[str, str]) -> str:
    return _first_value(data, "SAMPLE_KEY", "SAMPLEKEY", "LBREFID", "PCREFID", "PPREFID")

def _sample_collection_lbdtc(sample: dict[str, Any]) -> str:
    date_value = _first_value(sample, "ST_DATE_TAKEN", "DATE_TAKEN")
    if not date_value:
        return ""
    parsed = _parse_source_date(date_value)
    date_part = parsed.date().isoformat() if parsed else date_value.split("T", 1)[0]
    status = _first_value(sample, "STATUS", "COLLECTION_STATUS").upper().replace("_", " ")
    time_value = _first_value(sample, "ST_TIME_TAKEN", "TIME_TAKEN")
    collected = status in {"Y", "YES", "COLLECTED", "TAKEN"}
    if not collected:
        return date_part
    if not time_value:
        return date_part
    return f"{date_part}T{time_value}"

def _value_by_fragment(data: dict[str, str], *fragments: str) -> str:
    for key, value in data.items():
        normalized = key.upper().replace("_", "")
        if any(fragment.upper().replace("_", "") in normalized for fragment in fragments) and _is_present(value):
            return str(value).strip()
    return ""

def _modifier_result(name: str) -> tuple[str, str]:
    pieces = name.strip().rsplit(" ", 1)
    return pieces if len(pieces) == 2 else (name.strip(), "")

def _morphology_result(data: dict[str, str], severity: str) -> str:
    parts = [severity]
    for name_fragments, value_fragments, label in (
        (("SIZE",), ("SIZEVALUE", "SIZE_VAL"), "size"),
        (("LOCATION", "LOC"), ("LOCATIONVALUE", "LOC_VAL"), "location"),
        (("NUMERIC", "NUMBER", "QUANTITY"), ("NUMERICVALUE", "NUMBERVALUE", "VALUE"), "numeric"),
    ):
        name = _value_by_fragment(data, *name_fragments)
        value = _value_by_fragment(data, *value_fragments)
        if name and value and name.upper() != value.upper():
            units = _value_by_fragment(data, "UNIT", "UOM") if label == "numeric" else ""
            parts.append(f"{name}= {value}{f'({units})' if units else ''}")
        elif name:
            parts.append(name)
    return ", ".join(part for part in parts if part)

def _is_not_performed(value: str) -> bool:
    return "NOT PERFORMED" in value.upper()

def _urine_unit(severity: str) -> str:
    match = re.search(r"[^\s,]+/[^\s,]*(?:\s|$)", severity)
    return match.group(0).strip() if match else ""

def _expand_pristima_lb_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    cell_name = settings.CELL_MORPHOLOGY_MEASUREMENT_NAME.strip().upper()
    urine_name = settings.URINE_MICROSCOPIC_MEASUREMENT_NAME.strip().upper()
    expanded = []
    cell_base_keys = set()
    for row in rows:
        measurement_name = _first_value(row, "MEASUREMENT_NAME", "MEASUREMENT", "TEST_NAME").upper()
        if cell_name not in measurement_name and urine_name not in measurement_name:
            expanded.append(row)
            continue
        subcategory = _first_value(row, "SUBCATEGORY_NAME", "SUBCATEGORY", "OBSERVATION_NAME", "OBSERVATION")
        severity = _first_value(row, "SEVERITY_NAME", "SEVERITY")
        modifiers = [
            _value_by_fragment(row, f"MODIFIER_{index}NAME", f"MODIFIER{index}NAME")
            for index in range(1, 4)
        ]
        result = _morphology_result(row, severity)
        not_performed = _is_not_performed(severity)
        if not_performed and urine_name in measurement_name:
            base = dict(row, LBTESTCD=subcategory, LBTEST=subcategory, LBSTAT="N",
                        LBREASND=severity.split("-", 1)[1].strip() if "-" in severity else "",
                        LBORRES=None, LBSTRESC=None, LBSTRESN=None, Type=3, Modifier="")
            expanded.append(base)
            continue
        base_key = (subcategory.upper(), severity.upper())
        if urine_name in measurement_name:
            result = ", ".join(filter(None, [result, *modifiers]))
            base = dict(row, LBTESTCD=subcategory, LBTEST=subcategory, LBORRES=result, LBSTRESC=result,
                        LBORRESU=_urine_unit(severity), LBSTRESU=_urine_unit(severity), Type=3, Modifier=result)
            expanded.append(base)
        elif base_key not in cell_base_keys:
            cell_base_keys.add(base_key)
            expanded.append(dict(row, LBTESTCD=subcategory, LBTEST=subcategory,
                                 LBORRES=result, LBSTRESC=result, Type=2, Modifier=result))
        for modifier in modifiers:
            if modifier:
                test_name, modifier_value = _modifier_result(modifier)
                expanded.append(dict(row, LBTESTCD=test_name, LBTEST=test_name,
                                     LBORRES=modifier_value, LBSTRESC=modifier_value, Type=2, Modifier=modifier))
    return expanded

def _merge_sample_collection(data: dict[str, str], sample: dict[str, Any], domain: str) -> dict[str, str]:
    merged = dict(data)
    field_map = {
        "ST_DATE_TAKEN": "PCDTC" if domain == "PC" else "PPDTC",
        "ST_TIME_TAKEN": "PCDTC" if domain == "PC" else "PPDTC",
        "DATE_TAKEN": "PCENDTC" if domain == "PC" else "PPENDTC",
        "TIME_TAKEN": "PCENDTC" if domain == "PC" else "PPENDTC",
        "STATUS": "PCSTAT" if domain == "PC" else "PPSTAT",
        "REASON_NOT_TAKEN": "PCREASND" if domain == "PC" else "PPREASND",
        "SESSION_NAME": "PCTPT" if domain == "PC" else "PPTPT",
        "ANALYSIS_ST_NAME": "PCSPEC" if domain == "PC" else "PPSPEC",
        "DOSING_DATE_TIME": "PCRFTDTC" if domain == "PC" else "PPRFTDTC",
        "DOSE_REFERENCE_TEXT": "PCTPTREF" if domain == "PC" else "PPTPTREF",
    }
    for source, target in field_map.items():
        if not _is_present(merged.get(target)) and _is_present(sample.get(source)):
            merged[target] = str(sample[source])
    start_date = _first_value(sample, "ST_DATE_TAKEN")
    start_time = _first_value(sample, "ST_TIME_TAKEN")
    if not _is_present(data.get("PCDTC" if domain == "PC" else "PPDTC")) and start_date:
        merged["PCDTC" if domain == "PC" else "PPDTC"] = f"{start_date}T{start_time}" if start_time else start_date
    analysis_name = _first_value(sample, "ANALYSIS_ST_NAME")
    configured = {name.strip().upper() for name in settings.PC_PP_ANALYSIS_NAMES.split(",") if name.strip()}
    if analysis_name:
        merged["SAMPLE_ANALYSIS_TYPE"] = "PK" if analysis_name.upper() in configured else "LAB"
    return merged

def _parse_source_date(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None

def _normalize_bw_date(data: dict[str, str], source_type: str) -> None:
    if not _is_present(data.get("BWDTC")):
        date_taken = _first_value(data, "DATE_DATA_TAKEN", "DATE_TAKEN", "DATETAKEN", "BW_DATE")
        entry_datetime = _first_value(data, "ENTRY_DATETIME", "ENTRY_DATE_TIME", "ENTRY_DATE", "DATETIME_ENTERED")
        realtime = _first_value(data, "REAL_TIME_FLAG", "REALTIME_FLAG", "REALTIME")
        entry_flag = _first_value(data, "ENTRY_FLAG")
        use_entry_time = realtime.upper() == "Y" or (source_type != "PRISTIMA_API" and entry_flag.upper() == "O")
        if entry_flag.upper() == "K":
            use_entry_time = False
        selected = entry_datetime if use_entry_time and entry_datetime else date_taken
        if selected:
            parsed = _parse_source_date(selected)
            if parsed:
                data["BWDTC"] = parsed.isoformat() if settings.REQUIRE_BW_TIME_OF_COLLECTION and use_entry_time else parsed.date().isoformat()
            else:
                data["BWDTC"] = selected

def _normalize_om_record(data: dict[str, str], source_type: str) -> None:
    test_text = _first_value(data, "OMTEST", "TEST_NAME", "MEASUREMENT_NAME").upper()
    calculated = str(data.get("CALCULATED", data.get("IS_CALCULATED", ""))).upper() in {"Y", "YES", "TRUE", "1"}
    ratio_type = _first_value(data, "RATIO_TYPE", "OM_RATIO_TYPE").upper()
    if ratio_type in {"BODY", "BODY WEIGHT", "ORGAN TO BODY WEIGHT"} or "BODY WEIGHT RATIO" in test_text:
        data["OMTESTCD"], data["OMTEST"] = "OWBW", "Organ to Body Weight Ratio"
    elif ratio_type in {"BRAIN", "ORGAN TO BRAIN", "BRAIN WEIGHT"} or "BRAIN RATIO" in test_text:
        data["OMTESTCD"], data["OMTEST"] = "OWBR", "Organ to Brain Weight Ratio"
    elif calculated and ("BRAIN" in test_text or "BODY" in test_text):
        data["OMTESTCD"], data["OMTEST"] = ("OWBR", "Organ to Brain Weight Ratio") if "BRAIN" in test_text else ("OWBW", "Organ to Body Weight Ratio")
    else:
        data["OMTESTCD"], data["OMTEST"] = "WEIGHT", "Weight"
    if not _is_present(data.get("OMDTC")):
        date_taken = _first_value(data, "DATE_DATA_TAKEN", "DATE_TAKEN", "DATETAKEN", "OM_DATE")
        entry_datetime = _first_value(data, "ENTRY_DATETIME", "ENTRY_DATE_TIME", "ENTRY_DATE", "DATETIME_ENTERED")
        realtime = _first_value(data, "REAL_TIME_FLAG", "REALTIME_FLAG", "REALTIME")
        entry_flag = _first_value(data, "ENTRY_FLAG")
        use_entry_time = realtime.upper() == "Y" or (source_type != "PRISTIMA_API" and entry_flag.upper() == "O")
        if entry_flag.upper() == "K":
            use_entry_time = False
        selected = entry_datetime if use_entry_time and entry_datetime else date_taken
        if selected:
            parsed = _parse_source_date(selected)
            data["OMDTC"] = parsed.isoformat() if parsed and settings.REQUIRE_OM_TIME_OF_COLLECTION and use_entry_time else parsed.date().isoformat() if parsed else selected

def _numeric_value(value: Any) -> float | None:
    if not _is_present(value):
        return None
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None

def _normalized_key(value: str) -> str:
    return value.upper().replace("_", "").replace(" ", "")

def _configured_frequency_subsections() -> set[str]:
    configured = {value.strip() for value in (
        settings.TEST_ARTICLE_DOSING_FREQUENCY_SUBSECTION,
        settings.STUDY_DOSING_FREQUENCY_SUBSECTION,
    ) if value.strip()}
    path = Path(__file__).resolve().parents[4] / "Application" / "TypeDefinition.properties"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" not in line or line.strip().startswith("#"):
                continue
            key, value = line.split("=", 1)
            if key.strip().upper().startswith(("TESTARTICLESHORTSSNAME", "SHORTTEXTSSNAME")):
                configured.add(value.strip())
    return {_normalized_key(value) for value in configured}

def _extract_frequency(data: dict[str, Any], prefixes: tuple[str, ...]) -> str:
    configured = _configured_frequency_subsections()
    for key, value in data.items():
        normalized = _normalized_key(key)
        if _is_present(value) and any(normalized.startswith(_normalized_key(prefix)) for prefix in prefixes):
            return str(value).strip()
        if _is_present(value) and normalized in configured:
            return str(value).strip()
    return ""

def _normalize_ex_dosing_frequency(data: dict[str, str]) -> None:
    regimen = _first_value(data, "REGIMEN_DOSING_FREQUENCY", "REGIMEN_FREQUENCY", "DOSE_REGIMEN_FREQUENCY")
    if not regimen:
        regimen = _extract_frequency(data, ("REGIMEN", "DOSE_REGIMEN", "TEST_ARTICLE"))
    study = _first_value(data, "STUDY_DOSING_FREQUENCY", "STUDY_FREQUENCY")
    if not study:
        study = _extract_frequency(data, ("STUDY", "SHORT_TEXT"))
    data["EXDOSFRQ"] = regimen or study or ""
    try:
        if float(str(data.get("EXDOSE", "")).strip()) == 0:
            data["EXLOT"] = None
    except (TypeError, ValueError):
        pass

def _load_coded_comments() -> dict[str, str]:
    path = Path(__file__).resolve().parents[4] / "Application" / "CodedComment.Properties"
    if not path.exists():
        return {}
    mappings = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith(("#", ";")) and "=" in line:
            source, target = line.split("=", 1)
            mappings[source.strip().upper()] = target.strip()
    return mappings

CODED_COMMENT_MAPPINGS = _load_coded_comments()

def _normalize_lb_mode2(data: dict[str, str]) -> None:
    value_key = next((key for key in ("LBORRES", "LBSTRESC") if _is_present(data.get(key))), "LBORRES")
    value = _first_value(data, "LBORRES", "LBSTRESC")
    coded_comment = _first_value(data, "COMMENT", "CODED_COMMENT", "LBCOM", "LBCOMMENT")
    source = coded_comment or value
    mapped = CODED_COMMENT_MAPPINGS.get(source.upper()) if source else None
    is_dash = value in {"", ".", "-"}
    is_inequality = value.startswith((">", "<"))
    if not source or (is_dash and not coded_comment):
        data["LBSTAT"] = "NOT DONE"
        data["LBORRES"] = ""
        data["LBSTRESC"] = ""
        return
    if mapped:
        data[value_key] = mapped
        data["LBSTRESC"] = mapped
        data["LBSTAT"] = "NOT DONE" if mapped.strip().upper() == "NOT DONE" else "NULL"
        if data["LBSTAT"] == "NOT DONE":
            data["LBREASND"] = mapped
        return
    if coded_comment and (is_inequality or is_dash):
        if is_dash and settings.EmptyValueMappedToN:
            data["LBSTAT"] = "NOT DONE"
            data["LBREASND"] = coded_comment
        else:
            data["LBSTAT"] = "NULL"
        data[value_key] = coded_comment
        data["LBSTRESC"] = coded_comment
        return
    data["LBSTAT"] = "Y"
    if coded_comment and not value:
        data[value_key] = coded_comment
        data["LBSTRESC"] = coded_comment
def _normalize_lb_record(data: dict[str, str]) -> None:
    """Apply FS27.24 laboratory result and status rules."""
    result_text = _first_value(data, "LBORRES", "LBSTRESC")
    marker_chars = settings.Clinpath_Numeric_And_Text_Chars or "<>"
    if result_text and any(result_text.startswith(marker) for marker in marker_chars):
        data["LBSTRESN"] = None
        data["NUMERICAL_VALUE"] = (_numeric_value(result_text[1:].strip())
                                    if settings.Clinpath_Numeric_And_Text else None)
    result = _numeric_value(data.get("LBSTRESN"))
    lower = _numeric_value(data.get("LBSTNRLO"))
    upper = _numeric_value(data.get("LBSTNRHI"))
    if result is not None and lower is not None and upper is not None:
        data["LBNRIND"] = "LOW" if result < lower else "HIGH" if result > upper else "NORMAL"

    if settings.LBModuleMode == 2:
        _normalize_lb_mode2(data)
        if str(data.get("LBSTAT", "")).strip().upper() == "NOT DONE":
            for variable in LB_RANGE_VARIABLES:
                data[variable] = None
        return
    if settings.LBModuleMode != 1:
        return
    status = _first_value(data, "LBSTAT").upper()
    if status not in {"Y", "N"}:
        return
    original_result = _first_value(data, "LBORRES")
    has_result = _is_present(original_result) and original_result != "."
    coded_comment = _first_value(data, "COMMENT", "CODED_COMMENT", "LBCOM", "LBCOMMENT")
    parameter_comment_key = next((key for key in ("LBMODIFY", "LBCOMMENT", "LBCOM") if _is_present(data.get(key))), "LBMODIFY")
    existing_comment = _first_value(data, parameter_comment_key)
    marked_result = original_result.startswith((">", "<"))
    if status == "Y" or marked_result:
        data["LBSTAT"] = "NULL"
    else:
        data["LBSTAT"] = "NOT DONE"
    if data["LBSTAT"] == "NOT DONE":
        for variable in LB_RANGE_VARIABLES:
            data[variable] = None
    if coded_comment:
        if marked_result or not has_result:
            data["COCOMMENT"] = coded_comment
        else:
            data[parameter_comment_key] = f"{existing_comment}; {coded_comment}" if existing_comment else coded_comment

def _is_calculated_om_row(data: dict[str, Any]) -> bool:
    if str(data.get("CALCULATED", data.get("IS_CALCULATED", ""))).upper() in {"Y", "YES", "TRUE", "1"}:
        return True
    return any("RATIO" in key.upper() and ("BRAIN" in key.upper() or "TERMINAL" in key.upper() or "TBW" in key.upper())
               and _is_present(value) for key, value in data.items())

def _row_permissions(measurement_type: str, data: dict[str, Any], is_pristima: bool) -> dict[str, Any]:
    domain = measurement_type.upper()
    keys = {key.upper() for key in data}
    if domain == "OM" and _is_calculated_om_row(data):
        return {"can_edit": False, "can_delete": False, "editable_columns": [],
                "reason": "Organ-to-brain and organ-to-terminal-body-weight ratios are calculated from organ weights."}
    if domain.startswith("SUPP") and _is_generated_supplemental_row(data):
        return {"can_edit": False, "can_delete": False, "editable_columns": [],
                "reason": "This supplemental value was generated from the main record and must be edited with that record."}
    if domain == "CO" and any(_is_present(data.get(key)) for key in PARENT_COLUMNS):
        return {"can_edit": False, "can_delete": True, "editable_columns": [],
                "reason": "Comments for a parent-linked record must be edited with the parent record."}
    if domain == "CO":
        editable = sorted(key for key in keys if "COMMENT" in key or key in {"COCOM", "COCOMMENT"})
        return {"can_edit": bool(editable), "can_delete": True, "editable_columns": editable,
                "reason": "Only animal- and tissue-level comment fields can be edited here."}
    if domain == "DM" and is_pristima:
        editable = sorted(keys - {"RFXSTDTC", "RFXENDTC"})
        return {"can_edit": bool(editable), "can_delete": True, "editable_columns": editable,
                "protected_columns": ["RFXSTDTC", "RFXENDTC"],
                "reason": "RFXSTDTC and RFXENDTC are derived from EX exposure dates for Pristima studies."}
    if domain == "POOLDEF":
        editable = sorted(keys - POOL_IDENTIFIER_COLUMNS)
        return {"can_edit": bool(editable), "can_delete": True, "editable_columns": editable,
                "protected_columns": sorted(POOL_IDENTIFIER_COLUMNS),
                "reason": "POOLID and USUBJID changes require deletion and addition records."}
    return {"can_edit": True, "can_delete": True, "editable_columns": sorted(data)}

def _validate_import_rows(domain: str, rows: list[dict[str, str]]) -> None:
    if domain == "TS":
        for row in rows:
            value = row.get("TSVAL", "").strip()
            null_flavor = row.get("TSVALNF", "").strip().upper()
            if not value and not null_flavor:
                raise HTTPException(status_code=422, detail="TSVAL can be null only when TSVALNF is populated.")
            if null_flavor and null_flavor not in NULLFLAVOR_CODES:
                raise HTTPException(status_code=422, detail=f"Invalid TSVALNF null flavor '{null_flavor}'.")
    if domain == "DM":
        required = {"GRP_NUMBER"}
        missing = sorted(required - {key.upper() for key in rows[0]})
        if missing:
            raise HTTPException(status_code=422, detail=f"DM CSV requires: {', '.join(missing)}.")
        identifiers = {"SEDDM_ID", "USUBJID", "SUBJID"}
        if not identifiers & {key.upper() for key in rows[0]}:
            raise HTTPException(status_code=422, detail="DM CSV requires one animal identifier: SEDDM_ID, USUBJID, or SUBJID.")
    if domain == "OM" and any(_is_calculated_om_row(row) for row in rows):
        raise HTTPException(status_code=422, detail="Calculated organ-to-brain and organ-to-terminal-body-weight ratio records cannot be added here. Add or edit the source organ weight records instead.")
    if domain in STAT_COLUMNS:
        stat = STAT_COLUMNS[domain]
        if stat not in {key.upper() for key in rows[0]}:
            raise HTTPException(status_code=422, detail=f"{domain} additional data requires its {domain}STAT Y/N column.")
        invalid = [row[stat] for row in rows if row.get(stat, "").upper() not in {"Y", "N", ""}]
        if invalid:
            raise HTTPException(status_code=422, detail=f"{stat} values must be Y or N.")
    if domain == "POOLDEF":
        if "ACTION" not in {key.upper() for key in rows[0]}:
            raise HTTPException(status_code=422, detail="POOLDEF additional data requires an ACTION column.")
        invalid = [row.get("ACTION", "").upper() for row in rows if row.get("ACTION", "").upper() not in {"A", "D"}]
        if invalid:
            raise HTTPException(status_code=422, detail="POOLDEF ACTION supports only A (addition) or D (deletion).")
    if domain == "LB" and "LBSTAT" in {key.upper() for key in rows[0]}:
        dependency_names = {"LBCOM", "LBCOMMENT", "LBREASND", "LBMODIFY", "LBORRES", "LBSTRESC"}
        if not dependency_names & {key.upper() for key in rows[0]}:
            raise HTTPException(status_code=422, detail="LBSTAT depends on coded comment or result variables; include the dependency columns instead.")

@router.post("/{study_id}/upload", response_model=TaskResponse)
async def upload_raw_file(study_id: uuid.UUID, file: UploadFile = File(...),
    domain_hint: str = Form("AUTO"), db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study: raise HTTPException(status_code=404, detail="Study not found")
    allowed = {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel","text/csv"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
    contents = await file.read()
    from app.workers.tasks import ingest_file_task
    task = ingest_file_task.delay(str(study_id), file.filename, contents, domain_hint, current_user.get("sub"))
    return TaskResponse(task_id=task.id, status="queued", message=f"Ingestion queued for {file.filename}")

@router.get("/task/{task_id}")
async def get_task_status(task_id: str, _=Depends(get_current_user)):
    from app.workers.celery_app import celery_app
    result = celery_app.AsyncResult(task_id)
    return {"task_id": task_id, "status": result.status, "result": result.result if result.ready() else None}

@router.get("/measurements/{study_id}")
async def list_raw_measurements(study_id: uuid.UUID, measurement_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    query = select(RawMeasurement).where(RawMeasurement.study_id == study_id)
    if measurement_type:
        query = query.where(RawMeasurement.measurement_type == measurement_type)
    result = await db.execute(query.order_by(RawMeasurement.created_at, RawMeasurement.id))
    rows = result.scalars().all()
    return [{"id": str(row.id), "measurement_type": row.measurement_type, "record_id": row.record_id,
             "idvar": row.idvar, "idvarval": row.idvarval, "r_domain": row.r_domain,
             "source_filename": row.source_filename, "data": row.row_data,
             "permissions": _row_permissions(row.measurement_type, row.row_data, study.connection_type == "PRISTIMA_API"),
             "created_at": row.created_at, "updated_at": row.updated_at} for row in rows]

@router.get("/measurements/{study_id}/config")
async def raw_measurement_config(study_id: uuid.UUID, db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)):
    from app.models.study import Study
    if not await db.get(Study, study_id):
        raise HTTPException(status_code=404, detail="Study not found")
    return {"default_directory": settings.CSVInputDir,
            "r_transform_xpt_command_file": settings.R_TRANSFORM_XPT_COMMAND_FILE,
            "r_transform_xlsx_command_file": settings.R_TRANSFORM_XLSX_COMMAND_FILE,
            "module_letters": {"LB": sorted(_module_letters(settings.LBModuleLetter)),
                       "EG": sorted(_module_letters(settings.EGModuleLetter)),
                       "VS": sorted(_module_letters(settings.VSModuleLetter))}}

@router.post("/sample-collections/{study_id}/import-csv")
async def import_sample_collections(study_id: uuid.UUID, file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from app.models.study import Study
    if not await db.get(Study, study_id):
        raise HTTPException(status_code=404, detail="Study not found")
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Sample collection file must be CSV format.")
    reader = csv.DictReader(io.StringIO((await file.read()).decode("utf-8-sig")))
    if not reader.fieldnames or not any(name.upper() in {"SAMPLE_KEY", "SAMPLEKEY", "SAMPLE_KEY"} for name in reader.fieldnames):
        raise HTTPException(status_code=422, detail="Sample collection CSV requires SAMPLE_KEY.")
    headers = [header.strip().upper() for header in reader.fieldnames if header and header.strip()]
    rows = [{header: (row.get(source) or "").strip() for source, header in zip(reader.fieldnames, headers)} for row in reader]
    if not rows:
        raise HTTPException(status_code=400, detail="Sample collection CSV contains no data rows.")
    db.add_all([SampleCollection(study_id=study_id, sample_key=_sample_key(row), data=row) for row in rows])
    await db.commit()
    return {"status": "imported", "rows_imported": len(rows), "study_id": str(study_id)}

@router.post("/relrec/{study_id}/import-csv")
async def import_relrec(study_id: uuid.UUID, file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="RELREC file must be CSV format.")
    reader = csv.DictReader(io.StringIO((await file.read()).decode("utf-8-sig")))
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="RELREC CSV is empty or missing headers.")
    headers = [header.strip().upper() for header in reader.fieldnames if header and header.strip()]
    required = {"RDOMAIN", "IDVAR", "IDVARVAL", "RELID", "RELTYPE"}
    missing = sorted(required - set(headers))
    if missing:
        raise HTTPException(status_code=422, detail=f"RELREC CSV requires: {', '.join(missing)}.")
    rows = [{header: (row.get(source) or "").strip()
             for source, header in zip(reader.fieldnames, headers)} for row in reader]
    existing = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "RELREC",
        RawMeasurement.source_filename == file.filename))
    for record in existing.scalars().all():
        await db.delete(record)
    for row in rows:
        db.add(RawMeasurement(study_id=study_id, measurement_type="RELREC",
                              source_filename=file.filename, idvar=row.get("IDVAR"),
                              idvarval=row.get("IDVARVAL"), r_domain=row.get("RDOMAIN"), row_data=row))
    await db.commit()
    return {"status": "imported", "rows_imported": len(rows), "study_id": str(study_id)}

@router.post("/measurements/{study_id}/import-csv")
async def import_raw_measurements(study_id: uuid.UUID, file: UploadFile = File(...),
    supp_file: Optional[UploadFile] = File(None),
    measurement_type: str = Form("DM"), delete_domain_data: bool = Form(False),
    reason_for_edit: str = Form(""), reason_for_new: str = Form(""), reason_for_delete: str = Form(""),
    r_transform_xpt_command_file: str = Form(""), r_transform_xlsx_command_file: str = Form(""),
    pooldef_file_name: str = Form(""), relrec_cl_file_name: str = Form(""),
    relrec_ma_file_name: str = Form(""), relrec_mi_file_name: str = Form(""),
    relrec_pm_file_name: str = Form(""), relrec_tf_file_name: str = Form(""),
    supp_file_name: str = Form(""),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    from app.models.domain import AuditLog, OutputMapping
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    domain = measurement_type.strip().upper()
    if not domain or domain == "AUTO":
        raise HTTPException(status_code=422, detail="A SEND domain must be selected.")
    if domain == "BG" and study.connection_type not in {"CSV", "SEND_DATASET"}:
        raise HTTPException(status_code=422, detail="BG additional measurement data is available only for CSV Data Source and SEND Dataset studies.")
    if supp_file:
        if domain in UNSUPPORTED_SUPPLEMENTAL_DOMAINS:
            raise HTTPException(status_code=422, detail=f"SUPP{domain} is not supported by Additional Measurement Data.")
        if domain not in SUPPORTED_SUPPLEMENTAL_DOMAINS:
            raise HTTPException(status_code=422, detail=f"Supplemental loading is not supported for custom domain {domain}.")
        if domain == "BG" and study.connection_type not in {"CSV", "SEND_DATASET"}:
            raise HTTPException(status_code=422, detail="SUPPBG loading is supported only for CSV Data Source and SEND Dataset studies.")
    if not file.filename:
        raise HTTPException(status_code=400, detail="A data file name is required.")
    source_extension = Path(file.filename).suffix.lower()
    transform_command = ""
    if source_extension == ".xpt":
        transform_command = r_transform_xpt_command_file.strip()
    elif source_extension in {".xlsx", ".xls"}:
        transform_command = r_transform_xlsx_command_file.strip()
    elif source_extension != ".csv":
        raise HTTPException(status_code=400, detail="Data file must be CSV, XPT, or XLSX.")
    if source_extension != ".csv" and not transform_command:
        raise HTTPException(status_code=422, detail=f"An R transform command file is required for {source_extension} input.")
    if source_extension == ".csv" and (r_transform_xpt_command_file or r_transform_xlsx_command_file):
        raise HTTPException(status_code=422, detail="R transform commands are only valid for XPT or XLSX input files.")
    if not file.filename.upper().startswith(domain):
        raise HTTPException(status_code=422, detail=f"File name must start with the selected domain abbreviation ({domain}).")
    supp_rows: list[dict[str, str]] = []
    supp_domain = f"SUPP{domain}"
    if supp_file:
        if not supp_file.filename or not supp_file.filename.lower().endswith(".csv"):
            raise HTTPException(status_code=422, detail="Supplemental data file must be CSV format.")
        if not supp_file.filename.upper().startswith(supp_domain):
            raise HTTPException(status_code=422, detail=f"Supplemental file name must start with {supp_domain}.")
        try:
            supp_text = (await supp_file.read()).decode("utf-8-sig")
            supp_reader = csv.DictReader(io.StringIO(supp_text))
            if not supp_reader.fieldnames:
                raise ValueError("Supplemental CSV file is empty or missing headers.")
            supp_source_headers = [header for header in supp_reader.fieldnames if header and header.strip()]
            supp_headers = [header.strip().upper() for header in supp_source_headers]
            supp_rows = [{header: (row.get(source_header) or "").strip()
                          for source_header, header in zip(supp_source_headers, supp_headers)} for row in supp_reader]
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail="Supplemental CSV must be UTF-8 encoded.") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not supp_rows:
            raise HTTPException(status_code=400, detail="Supplemental CSV contains no data rows.")
        invalid_supp_actions = [row.get("ACTION", "A").upper() for row in supp_rows
                                if row.get("ACTION", "A").upper() not in {"A", "E", "D"}]
        if invalid_supp_actions:
            raise HTTPException(status_code=422, detail="Supplemental ACTION must be A (addition), E (update), or D (deletion).")
    if any(command and not command.lower().endswith((".bat", ".cmd", ".sh"))
           for command in (r_transform_xpt_command_file, r_transform_xlsx_command_file)):
        raise HTTPException(status_code=422, detail="R transform command file must be a batch or shell command file.")
    related_files = {
        "POOLDEF": pooldef_file_name, "CL": relrec_cl_file_name, "MA": relrec_ma_file_name,
        "MI": relrec_mi_file_name, "PM": relrec_pm_file_name, "TF": relrec_tf_file_name,
        "SUPPxx": supp_file_name,
    }
    invalid_related = [name for name in related_files.values() if name and not name.lower().endswith(".csv")]
    if invalid_related:
        raise HTTPException(status_code=422, detail="POOLDEF, RELREC, and SUPPxx file names must be CSV files.")
    try:
        if transform_command:
            input_name = Path(file.filename).name
            command_name = Path(transform_command).name
            input_directory = Path(settings.CSVInputDir).resolve()
            input_directory.mkdir(parents=True, exist_ok=True)
            input_path = input_directory / input_name
            command_path = input_directory / command_name
            transformed_path = Path(f"{input_path}_transformed.csv")
            if not command_path.exists():
                raise HTTPException(status_code=422, detail=f"Transform command file not found in CSVInputDir: {command_name}")
            input_path.write_bytes(await file.read())
            if os.name == "nt":
                process = await asyncio.create_subprocess_exec("cmd", "/c", str(command_path), str(input_path), str(transformed_path), cwd=str(input_directory), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            else:
                process = await asyncio.create_subprocess_exec(str(command_path), str(input_path), str(transformed_path), cwd=str(input_directory), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=300)
            except asyncio.TimeoutError as exc:
                process.kill()
                await process.wait()
                raise HTTPException(status_code=422, detail="Transform command exceeded the 5-minute timeout.") from exc
            if process.returncode != 0:
                detail = stderr.decode(errors="replace").strip() or stdout.decode(errors="replace").strip()
                raise HTTPException(status_code=422, detail=f"Transform command failed: {detail or process.returncode}")
            if not transformed_path.exists():
                raise HTTPException(status_code=422, detail=f"Transform command completed without producing {transformed_path.name}.")
            text = transformed_path.read_text(encoding="utf-8-sig")
        else:
            text = (await file.read()).decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise ValueError("CSV file is empty or missing headers.")
        source_headers = [header for header in reader.fieldnames if header and header.strip()]
        headers = [header.strip().upper() for header in source_headers]
        rows = [{header: (row.get(source_header) or "").strip()
             for source_header, header in zip(source_headers, headers)} for row in reader]
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not rows:
        raise HTTPException(status_code=400, detail="CSV contains no data rows.")
    normalized_type = domain
    if normalized_type in {"PC", "PP", "LB"}:
        sample_result = await db.execute(select(SampleCollection).where(SampleCollection.study_id == study_id))
        sample_by_key = {sample.sample_key: sample.data for sample in sample_result.scalars().all() if sample.sample_key}
        for row in rows:
            key = _lb_sample_key(row) if normalized_type == "LB" else _sample_key(row)
            sample = sample_by_key.get(key)
            if normalized_type == "LB":
                row["LBDTC"] = _sample_collection_lbdtc(sample) if sample else ""
            elif settings.PKMergeFlag.upper() == "Y" and sample:
                row.update(_merge_sample_collection(row, sample, normalized_type))
    if normalized_type == "LB" and study.connection_type == "PRISTIMA_API":
        rows = _expand_pristima_lb_rows(rows)
    if normalized_type == "SC" and study.connection_type == "PRISTIMA_API":
        rows = normalize_juvenile_weaning_rows(rows, "JUVENILE" in str(study.study_type or "").upper())
    if normalized_type == "BW":
        for row in rows:
            _normalize_bw_date(row, study.connection_type)
    if normalized_type == "EX":
        for row in rows:
            _normalize_ex_dosing_frequency(row)
    if normalized_type == "OM":
        for row in rows:
            _normalize_om_record(row, study.connection_type)
    if normalized_type == "LB":
        for row in rows:
            _normalize_lb_record(row)
    if normalized_type == "MI":
        for row in rows:
            _normalize_mi_status(row)
            _normalize_mi_modifiers(row)
            _normalize_reproductive_mi_test(row)
        if study.connection_type == "PRISTIMA_API":
            rows = _consolidate_pristima_mi_pairs(rows)
    _validate_import_rows(normalized_type, rows)
    has_primary_key = bool(PRIMARY_KEY_COLUMNS.get(normalized_type) in headers)
    has_action_column = "ACTION" in headers
    reload_mode = not has_primary_key and not has_action_column
    if normalized_type == "POOLDEF" and settings.PICKID_DB.upper() != "Y":
        for row in rows:
            row.pop("PICKID", None)
    if reload_mode or delete_domain_data:
        existing_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type.in_((normalized_type, supp_domain))))
        for existing in existing_result.scalars().all():
            await db.delete(existing)

    existing_result = await db.execute(select(RawMeasurement).where(
        RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == normalized_type))
    primary_key = PRIMARY_KEY_COLUMNS.get(normalized_type)
    existing_by_primary = {
        str(existing.row_data.get(primary_key)).strip(): existing
        for existing in existing_result.scalars().all()
        if primary_key and _is_present(existing.row_data.get(primary_key))
    }
    mapping_result = await db.execute(select(OutputMapping).where(
        (OutputMapping.study_id == study_id) | (OutputMapping.study_id.is_(None)),
        OutputMapping.domain_code == normalized_type))
    editable_policies = {mapping.send_variable.upper(): mapping.editable.upper()
                         for mapping in mapping_result.scalars().all()
                         if mapping.editable and mapping.editable.upper() in {"Y", "N", "I"}}
    added = edited = deleted = 0
    for row in rows:
        action_value = row.pop("ACTION", "").strip().upper()
        primary_value = row.get(primary_key, "").strip() if primary_key else ""
        target_id = row.pop("RAW_MEASUREMENT_ID", row.pop("ID", "")).strip() or primary_value
        action = action_value or ("E" if has_primary_key else "A")
        if delete_domain_data and action != "A":
            raise HTTPException(status_code=422, detail="Delete data for the domain first supports only ACTION=A records.")
        if action == "A":
            if study.study_status == "DataLoaded" and not reason_for_new.strip():
                raise HTTPException(status_code=422, detail="Reason for New is required for ACTION=A records.")
            if primary_value and primary_value in existing_by_primary:
                raise HTTPException(status_code=422, detail=f"{primary_key}={primary_value} already exists; use it without ACTION to edit or ACTION=D to delete.")
            db.add(RawMeasurement(study_id=study_id, measurement_type=normalized_type,
                               source_filename=file.filename, record_id=_record_id_for(normalized_type, row, study.connection_type), row_data=row))
            added += 1
        elif action == "E":
            if study.study_status == "DataLoaded" and not reason_for_edit.strip():
                raise HTTPException(status_code=422, detail="Reason for Edit is required for ACTION=E records.")
            existing = existing_by_primary.get(primary_value) if primary_value else None
            if not existing:
                try:
                    existing = await db.get(RawMeasurement, uuid.UUID(target_id))
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail="Edit requires the domain primary key or a valid RAW_MEASUREMENT_ID.") from exc
            if not existing or existing.study_id != study_id or existing.measurement_type != normalized_type:
                raise HTTPException(status_code=404, detail="Raw measurement to edit was not found in this study and domain.")
            permissions = _row_permissions(existing.measurement_type, existing.row_data, study.connection_type == "PRISTIMA_API")
            if not permissions["can_edit"]:
                raise HTTPException(status_code=422, detail=permissions["reason"])
            old_data = dict(existing.row_data)
            updated_data = dict(existing.row_data)
            changed = {}
            for key, value in row.items():
                policy = editable_policies.get(key.upper(), "Y")
                old_value = existing.row_data.get(key)
                if policy == "N" or (policy == "I" and _is_present(old_value)):
                    continue
                if str(old_value or "") != str(value or ""):
                    updated_data[key] = value
                    changed[key] = {"old": old_value, "new": value}
            if not changed:
                continue
            existing.row_data = updated_data
            existing.updated_at = datetime.now(timezone.utc)
            edited += 1
        elif action == "D":
            if study.study_status == "DataLoaded" and not reason_for_delete.strip():
                raise HTTPException(status_code=422, detail="Reason for Delete is required for ACTION=D records.")
            existing = existing_by_primary.get(primary_value) if primary_value else None
            if not existing:
                try:
                    existing = await db.get(RawMeasurement, uuid.UUID(target_id))
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail="Delete requires the domain primary key or a valid RAW_MEASUREMENT_ID.") from exc
            if not existing or existing.study_id != study_id or existing.measurement_type != normalized_type:
                raise HTTPException(status_code=404, detail="Raw measurement to delete was not found in this study and domain.")
            permissions = _row_permissions(existing.measurement_type, existing.row_data, study.connection_type == "PRISTIMA_API")
            if not permissions["can_delete"]:
                raise HTTPException(status_code=422, detail=permissions["reason"])
            await db.delete(existing)
            deleted += 1
        else:
            raise HTTPException(status_code=422, detail="ACTION must be A (addition), E (edit), or D (deletion).")
        if study.study_status == "DataLoaded":
            db.add(AuditLog(study_id=study_id, user_id=current_user.get("sub"), action=f"RAW_MEASUREMENT_{action}",
                            resource_type=normalized_type, resource_id=target_id or None,
                            reason=(reason_for_edit.strip() if action == "E" else reason_for_delete.strip() if action == "D" else reason_for_new.strip()),
                            delta={"domain": normalized_type, "filename": file.filename,
                                "before": old_data if action == "E" else None,
                                "changes": changed if action == "E" else None}))
    await db.flush()
    if normalized_type in {"MI", "PM"}:
        pm_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "PM"))
        mi_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == "MI"))
        pm_rows = [record.row_data for record in pm_result.scalars().all()]
        mi_records = mi_result.scalars().all()
        if normalized_type == "MI":
            _set_mi_mass_ids([row for row in rows], pm_rows)
            for record in mi_records:
                record.row_data = dict(record.row_data)
                _set_mi_mass_ids([record.row_data], pm_rows)
        else:
            _set_mi_mass_ids([record.row_data for record in mi_records], [row for row in rows])
            for record in mi_records:
                record.row_data = dict(record.row_data)
    main_records = {}
    key_records = {}
    if supp_rows:
        main_result = await db.execute(select(RawMeasurement).where(
            RawMeasurement.study_id == study_id, RawMeasurement.measurement_type == normalized_type))
        main_records = {}
        sequence_column = RECORD_ID_SEQUENCE_COLUMNS.get(domain, f"{domain}SEQ")
        for main in main_result.scalars().all():
            sequence_value = main.row_data.get(sequence_column)
            if domain == "MI" and not _is_present(sequence_value):
                sequence_value = main.row_data.get("MASEQ")
            if _is_present(sequence_value):
                main_records[str(sequence_value).strip()] = main
            key = _key_tuple(_configured_keys(domain, main.row_data), main.row_data)
            if key:
                key_records[key] = main
    supp_added = supp_edited = supp_deleted = 0
    for row in supp_rows:
        action = row.pop("ACTION", "A").strip().upper() or "A"
        target_id = row.pop("RAW_MEASUREMENT_ID", row.pop("ID", "")).strip()
        if delete_domain_data and action != "A":
            raise HTTPException(status_code=422, detail="Delete data for the domain first supports only supplemental ACTION=A records.")
        if action == "A":
            if study.study_status == "DataLoaded" and not reason_for_new.strip():
                raise HTTPException(status_code=422, detail="Reason for New is required for supplemental ACTION=A records.")
            idvar, idvarval = _supplemental_link(domain, row, main_records, key_records, study.connection_type)
            sequence_column = RECORD_ID_SEQUENCE_COLUMNS.get(domain, f"{domain}SEQ")
            sequence_value = row.get(sequence_column) or (row.get("MASEQ") if domain == "MI" else "")
            if study.connection_type == "PRISTIMA_API" and idvar.upper() == sequence_column and sequence_value not in main_records:
                raise HTTPException(status_code=422, detail=f"No main {domain} record found for {sequence_column}={sequence_value}; supplemental record was not inserted.")
            if idvar:
                row.setdefault("IDVAR", idvar)
            if idvarval:
                row.setdefault("IDVARVAL", idvarval)
            db.add(RawMeasurement(study_id=study_id, measurement_type=supp_domain,
                                   source_filename=supp_file.filename if supp_file else None,
                                   record_id=_record_id_for(supp_domain, row, study.connection_type),
                                   idvar=idvar or None, idvarval=idvarval or None, r_domain=domain, row_data=row))
            supp_added += 1
        else:
            if action == "E" and study.study_status == "DataLoaded" and not reason_for_edit.strip():
                raise HTTPException(status_code=422, detail="Reason for Edit is required for supplemental ACTION=E records.")
            if action == "D" and study.study_status == "DataLoaded" and not reason_for_delete.strip():
                raise HTTPException(status_code=422, detail="Reason for Delete is required for supplemental ACTION=D records.")
            try:
                existing = await db.get(RawMeasurement, uuid.UUID(target_id))
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=f"Supplemental ACTION={action} requires a valid RAW_MEASUREMENT_ID or ID.") from exc
            if not existing or existing.study_id != study_id or existing.measurement_type != supp_domain:
                raise HTTPException(status_code=404, detail="Supplemental raw measurement was not found in this study and domain.")
            permissions = _row_permissions(existing.measurement_type, existing.row_data, study.connection_type == "PRISTIMA_API")
            if action == "E":
                if not permissions["can_edit"]:
                    raise HTTPException(status_code=422, detail=permissions["reason"])
                idvar, idvarval = _supplemental_link(domain, row, main_records, key_records, study.connection_type)
                supp_mapping_result = await db.execute(select(OutputMapping).where(
                    (OutputMapping.study_id == study_id) | (OutputMapping.study_id.is_(None)),
                    OutputMapping.domain_code == supp_domain))
                supp_policies = {mapping.send_variable.upper(): mapping.editable.upper()
                                 for mapping in supp_mapping_result.scalars().all()
                                 if mapping.editable and mapping.editable.upper() in {"Y", "N", "I"}}
                updated_data = dict(existing.row_data)
                for key, value in row.items():
                    policy = supp_policies.get(key.upper(), "Y")
                    if policy == "N" or (policy == "I" and _is_present(existing.row_data.get(key))):
                        continue
                    updated_data[key] = value
                existing.row_data = updated_data
                existing.idvar = idvar or existing.idvar
                existing.idvarval = idvarval or existing.idvarval
                existing.updated_at = datetime.now(timezone.utc)
                supp_edited += 1
            else:
                if not permissions["can_delete"]:
                    raise HTTPException(status_code=422, detail=permissions["reason"])
                await db.delete(existing)
                supp_deleted += 1
        if study.study_status == "DataLoaded":
            db.add(AuditLog(study_id=study_id, user_id=current_user.get("sub"), action=f"SUPPLEMENTAL_{action}",
                            resource_type=supp_domain, resource_id=target_id or None,
                            reason=(reason_for_edit.strip() if action == "E" else reason_for_delete.strip() if action == "D" else reason_for_new.strip()),
                            delta={"domain": supp_domain, "filename": supp_file.filename if supp_file else None}))
    await db.commit()
    from app.models.study import StudyGroup, StudyAnimal
    group_count = len((await db.execute(select(StudyGroup).where(StudyGroup.study_id == study_id))).scalars().all())
    animal_count = len((await db.execute(select(StudyAnimal).where(StudyAnimal.study_id == study_id))).scalars().all())
    write_session_log(study_id, {"event": "measurement_load", "study_name": study.pts_study_name,
                     "origin_study_name": study.import_study_name, "groups": group_count, "animals": animal_count,
                     "domain": normalized_type, "records_deleted": deleted, "records_inserted": added,
                     "records_edited": edited, "source_file": str(Path(settings.CSVInputDir).resolve() / file.filename)})
    return {"status": "imported", "study_id": str(study_id), "domain": normalized_type,
            "mode": "reload" if reload_mode else "edit",
            "delete_domain_data": delete_domain_data, "added": added + supp_added, "edited": edited + supp_edited, "deleted": deleted + supp_deleted,
            "supplemental": {"domain": supp_domain, "file_name": supp_file.filename if supp_file else None,
                             "added": supp_added, "edited": supp_edited, "deleted": supp_deleted},
            "columns": headers, "default_directory": settings.CSVInputDir,
            "r_transform_xpt_command_file": r_transform_xpt_command_file or None,
            "r_transform_xlsx_command_file": r_transform_xlsx_command_file or None,
            "pooldef_file_name": pooldef_file_name or None, "relrec_cl_file_name": relrec_cl_file_name or None,
            "relrec_ma_file_name": relrec_ma_file_name or None, "relrec_mi_file_name": relrec_mi_file_name or None,
            "relrec_pm_file_name": relrec_pm_file_name or None, "relrec_tf_file_name": relrec_tf_file_name or None,
            "supp_file_name": supp_file_name or None,
            "uploaded_by": current_user.get("sub")}

@router.put("/measurements/{study_id}/{measurement_id}")
async def update_raw_measurement(study_id: uuid.UUID, measurement_id: uuid.UUID,
    data: dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)):
    row = await db.get(RawMeasurement, measurement_id)
    if not row or row.study_id != study_id:
        raise HTTPException(status_code=404, detail="Raw measurement not found")
    if not data or not all(isinstance(key, str) for key in data):
        raise HTTPException(status_code=422, detail="Measurement data must be a non-empty object with text column names.")
    from app.models.study import Study
    study = await db.get(Study, study_id)
    permissions = _row_permissions(row.measurement_type, row.row_data, study.connection_type == "PRISTIMA_API")
    if not permissions["can_edit"]:
        raise HTTPException(status_code=422, detail=permissions["reason"])
    protected = set(permissions.get("protected_columns", []))
    incoming = {key.upper(): value for key, value in data.items()}
    existing = {key.upper(): value for key, value in row.row_data.items()}
    changed_protected = {key for key in protected if key in incoming
                         and str(incoming[key]) != str(existing.get(key, ""))}
    if changed_protected:
        raise HTTPException(status_code=422, detail=permissions["reason"])
    editable = set(permissions["editable_columns"])
    changed_noneditable = {key for key in incoming if key not in editable
                           and str(incoming[key]) != str(existing.get(key, ""))}
    if row.measurement_type.upper() == "CO" and changed_noneditable:
        raise HTTPException(status_code=422, detail=permissions["reason"])
    row.row_data = {key: ("" if value is None else str(value)) if key.upper() in editable else value
                    for key, value in {**row.row_data, **incoming}.items()}
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return {"id": str(row.id), "measurement_type": row.measurement_type, "record_id": row.record_id,
            "idvar": row.idvar, "idvarval": row.idvarval, "r_domain": row.r_domain, "source_filename": row.source_filename,
            "data": row.row_data, "permissions": _row_permissions(row.measurement_type, row.row_data, study.connection_type == "PRISTIMA_API"),
            "created_at": row.created_at, "updated_at": row.updated_at}

@router.delete("/measurements/{study_id}/{measurement_id}", status_code=204)
async def delete_raw_measurement(study_id: uuid.UUID, measurement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    row = await db.get(RawMeasurement, measurement_id)
    if not row or row.study_id != study_id:
        raise HTTPException(status_code=404, detail="Raw measurement not found")
    from app.models.study import Study
    study = await db.get(Study, study_id)
    permissions = _row_permissions(row.measurement_type, row.row_data, study.connection_type == "PRISTIMA_API")
    if not permissions["can_delete"]:
        raise HTTPException(status_code=422, detail=permissions["reason"])
    await db.delete(row)
    await db.commit()

@router.get("/measurements/{study_id}/export-csv")
async def export_raw_measurements(study_id: uuid.UUID, measurement_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)):
    query = select(RawMeasurement).where(RawMeasurement.study_id == study_id)
    if measurement_type:
        query = query.where(RawMeasurement.measurement_type == measurement_type.upper())
    result = await db.execute(query
                              .order_by(RawMeasurement.created_at, RawMeasurement.id))
    rows = [row.row_data for row in result.scalars().all()]
    headers = list(dict.fromkeys(key for row in rows for key in row))
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers or ["data"], extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    suffix = f"_{measurement_type.upper()}" if measurement_type else "_measurements"
    response.headers["Content-Disposition"] = f'attachment; filename="study_{study_id}{suffix}.csv"'
    return response
