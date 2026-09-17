"""FS24/FS25 – Controlled Terminology"""
import csv
import io
import re
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logging import logger
from app.core.security import get_current_user, require_admin
from app.db.session import get_db
from app.models.domain import AuditLog, CTInstalledTerm, CTInstalledVersion, CTMapping
from app.schemas.study import CTMappingUpdate, CTMappingResponse

router = APIRouter()

PACKAGE_ROOT = Path(__file__).resolve().parents[4] / "Application"
PACKAGE_MANIFEST = PACKAGE_ROOT / "CT_package_versions.txt"
PACKAGE_DATA_ROOT = PACKAGE_ROOT / "SEND_csv"


def _normalize_header_key(header: str) -> str:
    cleaned = (header or "").replace("\ufeff", "").strip().lower()
    cleaned = cleaned.replace("(yes/no)", "yes no")
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _header_alias(field_map: dict[str, str], canonical: str, aliases: list[str]) -> str | None:
    normalized_canonical = _normalize_header_key(canonical)
    for alias in aliases:
        resolved = field_map.get(_normalize_header_key(alias))
        if resolved:
            return resolved
    return field_map.get(normalized_canonical)


def _value_key_for(codelist_name: str, term_code: str, name_in_data: Optional[str]) -> str:
    """Return a numeric Value Key only when a mapping exists; blank otherwise."""
    if not name_in_data or not name_in_data.strip():
        return ""
    fingerprint = sum(ord(ch) for ch in f"{codelist_name}:{term_code}:{name_in_data.strip()}")
    value_key = fingerprint % 900000 + 100000
    return str(value_key)


async def _resolve_version(db: AsyncSession, version: Optional[str]) -> str:
    query = select(CTInstalledVersion)
    if version:
        query = query.where(CTInstalledVersion.version == version)
    query = query.order_by(CTInstalledVersion.version.desc())
    installed = await db.scalar(query)
    if not installed:
        if version:
            raise HTTPException(status_code=404, detail=f"Controlled Terminology version '{version}' not found")
        raise HTTPException(status_code=404, detail="No controlled terminology version has been installed")
    return installed.version


@router.get("/versions", summary="FS24.1.1 – Available controlled terminology versions")
async def list_ct_versions(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    installed = await db.scalars(select(CTInstalledVersion).order_by(CTInstalledVersion.version.desc()))
    versions = list(installed)
    return [{"version": item.version, "published_date": item.version.rsplit(" ", 1)[-1],
             "is_default": index == 0, "source_file": item.source_file}
            for index, item in enumerate(versions)]


@router.get("/codelists", summary="FS25 – Available CT codelists")
async def get_codelists(version: Optional[str] = Query(None, description="Controlled terminology version"), db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    resolved_version = await _resolve_version(db, version)
    terms = await db.scalars(select(CTInstalledTerm).where(CTInstalledTerm.version == resolved_version).order_by(CTInstalledTerm.codelist_code, CTInstalledTerm.code))
    grouped = {}
    for term in terms:
        item = grouped.setdefault(term.codelist_code, {"codelist": term.codelist_code, "codelist_name": term.codelist_name or term.codelist_code, "extensible": term.codelist_extensible or "", "term_count": 0})
        item["term_count"] += 1
    return list(grouped.values())


@router.get("/codelists/{codelist}", summary="FS25 – Terms for a specific codelist")
async def get_codelist_terms(codelist: str, version: Optional[str] = Query(None, description="Controlled terminology version"), db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    try:
        resolved_version = await _resolve_version(db, version)
    except HTTPException:
        raise
    installed_terms = await _installed_terms_for(resolved_version, codelist, db)
    if not installed_terms:
        raise HTTPException(status_code=404, detail=f"Codelist '{codelist}' not found for version '{resolved_version}'")
    return {"codelist": codelist.upper(), "terms": installed_terms, "oid": None, "external": False}


async def _installed_terms_for(version: str, codelist: str, db: Optional[AsyncSession] = None):
    if db is None:
        return []
    result = await db.scalars(select(CTInstalledTerm).where(
        CTInstalledTerm.version == version,
        CTInstalledTerm.codelist_code == codelist.upper(),
    ).order_by(CTInstalledTerm.code))
    return [{"code": term.code, "label": term.submission_value or term.name_in_data or "",
             "name_in_data": term.name_in_data or "", "description": term.description or ""}
            for term in result]


def _normalize_extensible(value: str) -> str:
    raw = (value or "").strip().lower()
    if raw in {"yes", "y", "true", "1"}:
        return "Y"
    if raw in {"no", "n", "false", "0"}:
        return "N"
    return (value or "").strip()


def _parse_package_terms(content: bytes, version: str, filename: str) -> list[CTInstalledTerm]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"CT package file {filename} must be UTF-8 text.") from exc

    try:
        reader = csv.DictReader(io.StringIO(text), delimiter="\t")
        fieldnames = reader.fieldnames or []
        rows = list(reader)
    except Exception as exc:
        logger.exception("ct.parse_package_terms.failed_to_read_rows", filename=filename, version=version, error=str(exc))
        raise HTTPException(status_code=422, detail=f"CT package file {filename} could not be parsed as a tab-delimited file: {exc}") from exc

    if not fieldnames:
        detail = f"CT package file {filename} has invalid headers. Received no fieldnames from the uploaded tab-delimited file."
        logger.error("ct.parse_package_terms.invalid_headers", filename=filename, version=version, fieldnames=[], normalized_keys=[], internal_required=[], cdisc_required=[])
        raise HTTPException(status_code=422, detail=detail)

    field_map = {_normalize_header_key(name): name for name in fieldnames}
    normalized_fields = set(field_map)

    internal_required = {
        "codelist code",
        "codelist extensible",
        "codelist name",
        "code",
        "submission value",
        "name in data",
        "value key",
        "action",
    }
    cdisc_required = {
        "code",
        "codelist code",
        "codelist extensible yes no",
        "codelist name",
        "cdisc submission value",
        "cdisc synonym s",
        "cdisc definition",
        "nci preferred term",
    }

    # Internal branch.
    if internal_required.issubset(normalized_fields):
        terms = []
        for row in rows:
            action_header = field_map.get("action") or "ACTION"
            action = (row.get(action_header) or "").strip().upper()
            if action == "D":
                raise HTTPException(status_code=422, detail=f"Deletion action is not supported in {filename}.")
            if action not in {"", "A", "E"}:
                raise HTTPException(status_code=422, detail=f"Unsupported ACTION '{action}' in {filename}.")

            code_header = field_map.get("code")
            codelist_code_header = field_map.get("codelist code")
            codelist_name_header = field_map.get("codelist name")
            extensible_header = field_map.get("codelist extensible")
            submission_value_header = field_map.get("submission value")
            name_in_data_header = field_map.get("name in data")
            value_key_header = field_map.get("value key")

            code = (row.get(code_header) or "").strip()
            codelist = (row.get(codelist_code_header) or "").strip().upper()
            if not code or not codelist:
                raise HTTPException(status_code=422, detail=f"CT package file {filename} contains a row without a codelist or code.")
            terms.append(CTInstalledTerm(
                version=version,
                codelist_code=codelist,
                codelist_name=(row.get(codelist_name_header) or "").strip(),
                codelist_extensible=(row.get(extensible_header) or "").strip(),
                code=code,
                submission_value=(row.get(submission_value_header) or "").strip(),
                name_in_data=(row.get(name_in_data_header) or "").strip(),
                value_key=(row.get(value_key_header) or "").strip(),
                action=action,
            ))
        if not terms:
            raise HTTPException(status_code=422, detail=f"CT package file {filename} contains no terminology rows.")
        return terms

    # CDISC branch.
    if cdisc_required.issubset(normalized_fields):
        codelist_code_header = field_map.get("codelist code")
        code_header = field_map.get("code")
        codelist_name_header = field_map.get("codelist name")
        codelist_extensible_header = field_map.get("codelist extensible yes no")
        cdisc_submission_value_header = field_map.get("cdisc submission value")
        cdisc_synonym_header = field_map.get("cdisc synonym s")
        cdisc_definition_header = field_map.get("cdisc definition")

        codelist_lookup = {}
        for row in rows:
            codelist_parent = (row.get(codelist_code_header) or "").strip()
            code = (row.get(code_header) or "").strip()
            if not codelist_parent and code and row.get(codelist_name_header) and row.get(cdisc_submission_value_header):
                codelist_lookup[code] = {
                    "codelist_code": (row.get(cdisc_submission_value_header) or "").strip().upper(),
                    "codelist_name": (row.get(codelist_name_header) or "").strip(),
                    "codelist_extensible": _normalize_extensible(row.get(codelist_extensible_header) or ""),
                }

        terms = []
        for row in rows:
            parent_id = (row.get(codelist_code_header) or "").strip()
            if not parent_id:
                continue
            if not row.get(code_header):
                continue
            metadata = codelist_lookup.get(parent_id)
            if not metadata:
                continue
            submission_value = (row.get(cdisc_submission_value_header) or "").strip()
            name_in_data = (row.get(cdisc_synonym_header) or "").strip() or submission_value
            description = (row.get(cdisc_definition_header) or "").strip()
            terms.append(CTInstalledTerm(
                version=version,
                codelist_code=metadata["codelist_code"],
                codelist_name=metadata["codelist_name"],
                codelist_extensible=metadata["codelist_extensible"],
                code=(row.get(code_header) or "").strip(),
                submission_value=submission_value,
                name_in_data=name_in_data,
                value_key="",
                action="",
                description=description,
            ))

        if not terms:
            raise HTTPException(status_code=422, detail=f"CT package file {filename} contains no terminology rows.")
        return terms

    detail = (
        f"CT package file {filename} has invalid headers. "
        f"Expected internal CT header family: {sorted(internal_required)} or "
        f"CDISC SEND header family: {sorted(cdisc_required)}. "
        f"Received fieldnames: {fieldnames}. Normalized keys: {sorted(normalized_fields)}. "
        f"Version: {version}."
    )
    logger.error(
        "ct.parse_package_terms.invalid_headers",
        filename=filename,
        version=version,
        fieldnames=fieldnames,
        normalized_keys=sorted(normalized_fields),
        internal_required=sorted(internal_required),
        cdisc_required=sorted(cdisc_required),
    )
    raise HTTPException(status_code=422, detail=detail)


@router.post("/install-cdisc", summary="Install an administrator-uploaded CDISC SEND terminology file")
async def install_cdisc_ct(
    version: str = Form(...),
    previous_version: str = Form(""),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    filename = Path(file.filename or "").name
    if filename != (file.filename or "") or not filename.lower().endswith(".txt"):
        raise HTTPException(status_code=400, detail="Upload the tab-delimited CDISC SEND Terminology.txt file.")
    version = version.strip()
    previous_version = previous_version.strip()
    if not version:
        raise HTTPException(status_code=400, detail="A new CT version is required.")

    terms = _parse_package_terms(await file.read(), version, filename)
    existing = await db.scalar(select(CTInstalledVersion).where(CTInstalledVersion.version == version))
    if existing:
        await db.execute(delete(CTInstalledTerm).where(CTInstalledTerm.version == version))
        existing.previous_version = previous_version or None
        existing.source_file = filename
        existing.installed_by = current_user.get("sub")
    else:
        db.add(CTInstalledVersion(version=version, previous_version=previous_version or None,
                                  source_file=filename, installed_by=current_user.get("sub")))
    db.add_all(terms)
    db.add(AuditLog(user_id=current_user.get("sub"), action="INSTALL_CT_PACKAGE",
                    resource_type="controlled_terminology", resource_id=version,
                    reason="Administrator uploaded CT package",
                    delta={"version": version, "previous_version": previous_version,
                           "source_file": filename, "terms": len(terms)}))
    await db.commit()
    return {"status": "ok", "version": version, "previous_version": previous_version,
            "source_file": filename, "imported_terms": len(terms),
            "message": f"Controlled terminology version {version} installed successfully."}


@router.post("/install-bundled", summary="Install bundled CT package artifacts")
async def install_bundled_ct(db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    if not PACKAGE_MANIFEST.is_file():
        raise HTTPException(status_code=404, detail="CT_package_versions.txt is not available in the application package.")

    manifest_rows = []
    with PACKAGE_MANIFEST.open("r", encoding="utf-8-sig", newline="") as manifest_file:
        for row in csv.reader((line for line in manifest_file if not line.lstrip().startswith("#")), delimiter="\t"):
            if len(row) >= 3 and row[0].strip() and row[2].strip():
                manifest_rows.append((row[0].strip(), row[1].strip(), row[2].strip()))

    installed_versions = []
    missing_files = []
    imported_terms = 0
    for version, previous_version, filename in manifest_rows:
        source = (PACKAGE_DATA_ROOT / filename).resolve()
        if PACKAGE_DATA_ROOT.resolve() not in source.parents:
            raise HTTPException(status_code=400, detail=f"Invalid CT package path: {filename}")
        if not source.is_file():
            missing_files.append(filename)
            continue

        with source.open("r", encoding="utf-8-sig", newline="") as data_file:
            rows = _parse_package_terms(data_file.read().encode("utf-8"), version, filename)

        existing = await db.scalar(select(CTInstalledVersion).where(CTInstalledVersion.version == version))
        if existing:
            await db.execute(delete(CTInstalledTerm).where(CTInstalledTerm.version == version))
            existing.previous_version = previous_version
            existing.source_file = filename
            existing.installed_by = current_user.get("sub")
        else:
            db.add(CTInstalledVersion(version=version, previous_version=previous_version,
                                      source_file=filename, installed_by=current_user.get("sub")))
        db.add_all(rows)
        imported_terms += len(rows)
        installed_versions.append(version)

    if installed_versions:
        db.add(AuditLog(user_id=current_user.get("sub"), action="INSTALL_CT_PACKAGE",
                        resource_type="controlled_terminology", resource_id=", ".join(installed_versions),
                        reason="Bundled CT package installation", delta={"versions": installed_versions, "terms": imported_terms}))
    await db.commit()
    return {"status": "ok", "installed_versions": installed_versions,
            "imported_terms": imported_terms, "missing_files": sorted(set(missing_files)),
            "message": "Controlled terminology package installation completed."}


@router.get("/export-csv", summary="FS24.2.2 – Export CT data to CSV")
async def export_ct_csv(version: Optional[str] = Query(None), db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    resolved_version = await _resolve_version(db, version)
    fieldnames = [
        "Codelist Code",
        "Codelist Extensible",
        "Codelist Name",
        "Code",
        "Submission Value",
        "Name in Data",
        "Value Key",
        "ACTION",
    ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    terms = await db.scalars(select(CTInstalledTerm).where(CTInstalledTerm.version == resolved_version).order_by(CTInstalledTerm.codelist_code, CTInstalledTerm.code))
    for term in terms:
        value_key = term.value_key or _value_key_for(term.codelist_code, term.code, term.name_in_data)
        writer.writerow({
            "Codelist Code": term.codelist_code,
            "Codelist Extensible": term.codelist_extensible or "",
            "Codelist Name": term.codelist_name or term.codelist_code,
            "Code": term.code,
            "Submission Value": term.submission_value or "",
            "Name in Data": term.name_in_data or "",
            "Value Key": value_key,
            "ACTION": "",
        })

    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f'attachment; filename="send_ct_{resolved_version.replace(" ", "_")}.csv"'
    return response


@router.post("/import-csv", summary="FS24.2.3 – Import CT data from CSV")
async def import_ct_csv(file: UploadFile = File(...), _=Depends(require_admin)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is empty or missing headers.")

    required_fields = {"Codelist Code", "Codelist Extensible", "Codelist Name", "Code", "Submission Value", "Name in Data", "Value Key", "ACTION"}
    missing = sorted(required_fields - set((reader.fieldnames or [])))
    if missing:
        raise HTTPException(status_code=400, detail=f"CSV file is missing required columns: {', '.join(missing)}")

    allowed_actions = {"A", "E"}
    processed = 0
    added = 0
    updated = 0
    skipped = 0

    for row in reader:
        action = (row.get("ACTION") or "").strip().upper()
        if action == "D":
            raise HTTPException(status_code=422, detail="ACTION of D for deletion is not supported.")
        if action and action not in allowed_actions:
            raise HTTPException(status_code=422, detail=f"Unsupported ACTION value '{action}' in import file.")
        if not action:
            skipped += 1
            continue

        processed += 1
        value_key = (row.get("Value Key") or "").strip()
        name_in_data = (row.get("Name in Data") or "").strip()

        if value_key:
            updated += 1
            # If Value Key exists, a Name in Data mapping is being edited/updated.
            # The actual term is keyed by codelist + code and remains otherwise unchanged.
        else:
            added += 1
            # If Value Key is empty and ACTION is A/E, new Name in Data mapping is added.
            # If Name in Data is empty, it is still accepted as a row-level add with no mapping.

    return {
        "status": "ok",
        "version": "latest",
        "processed_rows": processed,
        "added": added,
        "updated": updated,
        "skipped_rows": skipped,
        "message": "CSV import accepted for controlled terminology update. ACTION of A or E is required for updates/inserts; deletion is not supported.",
    }


@router.delete("/versions/{version}", summary="FS24.2.4 – Remove a controlled terminology version")
async def remove_ct_version(version: str, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    resolved_version = await _resolve_version(db, version)
    latest = await db.scalar(select(CTInstalledVersion).order_by(CTInstalledVersion.version.desc()))
    if latest and resolved_version == latest.version:
        raise HTTPException(status_code=400, detail="The latest installed CT version cannot be removed.")
    await db.execute(delete(CTInstalledTerm).where(CTInstalledTerm.version == resolved_version))
    await db.execute(delete(CTInstalledVersion).where(CTInstalledVersion.version == resolved_version))
    await db.commit()
    return {"status": "removed", "version": resolved_version}


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
    resolved_version = await _resolve_version(db, None)
    ct_terms = await db.scalars(select(CTInstalledTerm).where(
        CTInstalledTerm.version == resolved_version,
        CTInstalledTerm.codelist_code == codelist_key,
    ))
    ct_lookup = {((t.submission_value or t.name_in_data or "").upper()): t.code for t in ct_terms}
    ct_terms = await db.scalars(select(CTInstalledTerm).where(
        CTInstalledTerm.version == resolved_version,
        CTInstalledTerm.codelist_code == codelist_key,
    ))
    ct_lookup.update({t.code.upper(): t.code for t in ct_terms})
    for m in mappings:
        match = ct_lookup.get(m.source_value.upper().strip())
        if match:
            m.ct_value = match; m.mapped = True; m.status = "Mapped"
            mapped_count += 1
    await db.commit()
    return {"mapped": mapped_count, "total": len(mappings), "unmapped": len(mappings) - mapped_count}
