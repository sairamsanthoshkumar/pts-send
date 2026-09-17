"""FS23/FS29/FS32/FS43 – Reports, Define.xml, Audit Trail"""
import uuid
import csv
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, ElementTree
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.db.session import get_db
from app.core.config import settings
from app.core.logging import logger
from app.schemas.study import TaskResponse

router = APIRouter()

class PackageRequest(BaseModel):
    include_define_xml: bool = True
    include_sdrg: bool = True
    include_xpt: bool = True
    output_format: str = "XPT"   # XPT | CSV | SEND_DATASET | XML
    define_version: str = "2.1"
    controlled_terminology_version: str = "2020-06-26"
    dart_enabled: bool = False
    genetox_enabled: bool = False

NCI_EXT_CODE_IDS = {
    ("BWTESTCD", "BW"): "C81328",
    ("BWTESTCD", "TERMBW"): "C90464",
}
NCI_CODELIST_EXT_CODE_IDS = {"BWTESTCD": "C89962"}

def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))

def _read_define_csv(path: Path) -> list[dict[str, str]]:
    """Read both Savante Define.csv layouts, including headerless supplements."""
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.reader(handle))
    if not rows:
        return []

    header = [value.strip() for value in rows[0]]
    header_lower = {value.casefold() for value in header}
    if ("variable name" not in header_lower and "field-option" not in header_lower
            and "method name" not in header_lower and "dataset" not in header_lower):
        return [
            {
                "Field-Option": row[0].strip(),
                "Variable Label": row[1].strip() if len(row) > 1 else "",
                "Document": row[2].strip() if len(row) > 2 else "",
                "Comment": row[3].strip() if len(row) > 3 else "",
            }
            for row in rows
            if row and row[0].strip().upper() == "SUPPLEMENT"
        ]

    format_index = next((index for index, value in enumerate(header)
                         if value.casefold() == "format"), None)
    normalized = []
    for values in rows[1:]:
        if not any(value.strip() for value in values):
            continue
        values = [value.strip() for value in values]
        if ("where variables" in header_lower and "comparator" in header_lower
                and "where values" in header_lower and len(values) > len(header)):
            comparator_index = next((index for index, value in enumerate(values[2:], 2)
                                     if value.upper() in {"LT", "LE", "GT", "GE", "EQ", "NE", "IN", "NOTIN"}), None)
            if comparator_index is not None:
                comparator_count = 0
                while (comparator_index + comparator_count < len(values)
                       and values[comparator_index + comparator_count].upper() in {"LT", "LE", "GT", "GE", "EQ", "NE", "IN", "NOTIN"}):
                    comparator_count += 1
                value_index = comparator_index + comparator_count
                condition_values = values[value_index:value_index + comparator_count]
                remaining = values[value_index + comparator_count:]
                values = (values[:2] + [",".join(values[2:comparator_index]),
                         ",".join(values[comparator_index: value_index]),
                         ",".join(condition_values)] + remaining)
        if format_index is not None and len(values) == len(header) - 1:
            values.insert(format_index, "")
        if len(values) > len(header):
            values = values[:len(header) - 1] + [",".join(values[len(header) - 1:])]
        values += [""] * (len(header) - len(values))
        normalized.append(dict(zip(header, values)))
    return normalized

def _discover_xpt_fields(output_directory: Path) -> dict[str, list[str]]:
    datasets = {}
    for path in sorted(output_directory.glob("*.xpt")):
        try:
            frame = pd.read_sas(path, format="xport", encoding="utf-8")
            datasets[path.stem.upper()] = [str(column).upper() for column in frame.columns]
        except (OSError, ValueError, UnicodeError) as exc:
            logger.warning("define.xpt_read_failed", file=str(path), error=str(exc))
    return datasets

def _dataset_code(value: str) -> str:
    return Path(value.strip()).stem.upper()

def _configuration_file(directory: Path, prefix: str, study_name: str) -> Path:
    safe_name = study_name.replace("/", "_").replace("\\", "_")
    for candidate in (directory / f"{prefix}_{study_name}.csv", directory / f"{prefix}_{safe_name}.csv",
                      directory / f"{prefix}_{study_name.upper()}.csv"):
        if candidate.exists():
            return candidate
    return directory / f"{prefix}_{safe_name}.csv"

def generate_define_xml(study_name: str, output_directory: Path, version: str,
                        controlled_terminology: list[dict[str, str]] | None = None,
                        send_ig_version: str = "3.1",
                        controlled_terminology_version: str = "2020-06-26",
                        dart_enabled: bool = False, genetox_enabled: bool = False) -> Path:
    if version not in {"1.0", "2.0", "2.1"}:
        raise ValueError("Define XML version must be 1.0, 2.0, or 2.1")
    if version == "1.0":
        controlled_terminology = None
    config_dir = Path(settings.DEFINE_XML_CONF_DIR)
    safe_name = study_name.replace("/", "_").replace("\\", "_")
    domains = _read_csv(config_dir / "domains.csv")
    if version in {"2.0", "2.1"}:
        domains = _read_csv(_configuration_file(config_dir, "Domains", study_name)) or domains
    system_define = _read_define_csv(config_dir / "Define.csv")
    study_define = _read_define_csv(_configuration_file(config_dir, "Define", study_name))
    define_rows = study_define or system_define
    methods = _read_define_csv(config_dir / "Method.csv")
    metadata = _read_define_csv(config_dir / "Metadata.csv") or _read_define_csv(config_dir / "metadata.csv")
    optional_code_lists = _read_define_csv(config_dir / "CodeLists.csv")
    if version in {"2.0", "2.1"}:
        methods = _read_define_csv(_configuration_file(config_dir, "Method", study_name)) or methods
        metadata = _read_define_csv(_configuration_file(config_dir, "metadata", study_name)) or metadata
        optional_code_lists = _read_define_csv(_configuration_file(config_dir, "CodeLists", study_name)) or optional_code_lists
    def_namespace = f"http://www.cdisc.org/ns/def/v{version}" if version in {"2.0", "2.1"} else ""
    if def_namespace:
        import xml.etree.ElementTree as ET
        ET.register_namespace("def", def_namespace)
    xpt_fields = _discover_xpt_fields(output_directory)
    configured_codes = {_dataset_code(row.get("Dataset", "")) for row in domains}
    for code in xpt_fields:
        if code not in configured_codes:
            domains.append({"Dataset": code, "Description": ""})
    domains = [row for row in domains if _dataset_code(row.get("Dataset", "")) in xpt_fields] or domains
    field_overrides = {}
    for row in system_define + study_define:
        variable = row.get("Variable Name", "").strip().upper()
        if variable:
            field_overrides[variable] = row
    root = Element("ODM", {"ODMVersion": "1.3", "FileType": "Snapshot", "CreationDateTime": ""})
    meta = SubElement(root, "MetaDataVersion", {"OID": "MDV.PtsSEND", "Name": f"PtsSEND {safe_name}", "DefineVersion": version})
    if def_namespace:
        standards = SubElement(meta, f"{{{def_namespace}}}Standards")
        SubElement(standards, f"{{{def_namespace}}}Standard", {"OID": "STD.01", "Name": "SEND Implementation Guide",
                                                                  "Type": "IG", "Status": "Final", "Version": send_ig_version})
        SubElement(standards, f"{{{def_namespace}}}Standard", {"OID": "STD.CT.01", "Name": "CDISC/NCI",
                                                                  "Type": "CT", "PublishingSet": "SEND", "Status": "Final",
                                                                  "Version": controlled_terminology_version})
        if dart_enabled:
            SubElement(standards, f"{{{def_namespace}}}Standard", {
                "OID": "STD.DART.01", "Name": settings.DartStandardName,
                "Type": "IG", "Status": "Final", "Version": settings.DartStandardVersion,
                f"{{{def_namespace}}}StandardName": settings.DartStandardName,
                f"{{{def_namespace}}}StandardVersion": settings.DartStandardVersion,
            })
        if genetox_enabled:
            SubElement(standards, f"{{{def_namespace}}}Standard", {
                "OID": "STD.GENETOX.01", "Name": settings.GeneToxStandardName,
                "Type": "IG", "Status": "Final", "Version": settings.GeneToxStandardVersion,
                f"{{{def_namespace}}}StandardName": settings.GeneToxStandardName,
                f"{{{def_namespace}}}StandardVersion": settings.GeneToxStandardVersion,
            })
        meta.set(f"{{{def_namespace}}}Context", "Submission")
    for row in system_define + study_define:
        if row.get("Field-Option", "").strip().upper() == "SUPPLEMENT":
            value = row.get("Variable Label", "").strip()
            document = row.get("Document", "").strip()
            if document:
                value = f"{value} ({document})" if value else document
            if value:
                SubElement(meta, "Description", {"Name": "Supplement", "Value": value})
    for domain in domains:
        code = _dataset_code(domain.get("Dataset", ""))
        dataset_attributes = {"OID": f"IG.{code}", "Name": code, "Repeating": "Yes"}
        if def_namespace and domain.get("IsNonStandard", "").strip().lower() in {"yes", "y", "true"}:
            dataset_attributes[f"{{{def_namespace}}}IsNonStandard"] = "Yes"
        dataset = SubElement(meta, "ItemGroupDef", dataset_attributes)
        fields = xpt_fields.get(code, [])
        for key in ("Description", "Structure", "Purpose", "Keys", "Class", "Comment", "Document", "Page"):
            if domain.get(key):
                SubElement(dataset, "Description", {"Name": key, "Value": domain[key]})
        for field in fields:
            row = field_overrides.get(f"{code}.{field}", field_overrides.get(field, {}))
            item = SubElement(meta, "ItemDef", {"OID": f"IT.{code}.{field}", "Name": field,
                              "DataType": row.get("DataType", row.get("Type", "text")),
                              "SASFieldName": row.get("Field-Option", field)})
            SubElement(dataset, "ItemRef", {"ItemOID": f"IT.{code}.{field}"})
            for key in ("Variable Label", "Format", "Core", "Role", "Origin", "Comment", "Method", "Document", "Page"):
                if row.get(key):
                    SubElement(item, "Description", {"Name": key, "Value": row[key]})
            if def_namespace and row.get("Origin", "").strip():
                origin_attributes = {"Type": row["Origin"].strip()}
                if row.get("Source", "").strip():
                    origin_attributes["Source"] = row["Source"].strip()
                SubElement(item, f"{{{def_namespace}}}Origin", origin_attributes)
    codelists = {}
    for term in controlled_terminology or []:
        codelist = term.get("codelist", "").strip().upper()
        code = term.get("code", "").strip()
        if codelist and code:
            codelists.setdefault(codelist, []).append(term)
    for codelist, terms in codelists.items():
        codelist_attributes = {"OID": codelist, "Name": codelist, "DataType": "text"}
        if def_namespace and not terms[0].get("user_defined"):
            codelist_attributes[f"{{{def_namespace}}}StandardOID"] = "STD.CT.01"
        elif def_namespace:
            codelist_attributes[f"{{{def_namespace}}}IsNonStandard"] = "Yes"
        code_list = SubElement(meta, "CodeList", codelist_attributes)
        seen_codes = set()
        for term in terms:
            code = term.get("code", "").strip()
            if code in seen_codes:
                continue
            seen_codes.add(code)
            item = SubElement(code_list, "CodeListItem", {"CodedValue": code})
            decode = SubElement(item, "Decode")
            SubElement(decode, "TranslatedText", {"{http://www.w3.org/XML/1998/namespace}lang": "en"}).text = term.get("label", code)
            if not term.get("user_defined"):
                ext_code_id = term.get("ext_code_id") or NCI_EXT_CODE_IDS.get((codelist, code))
                if ext_code_id:
                    SubElement(item, "Alias", {"Name": ext_code_id, "Context": "nci:ExtCodeID"})
        if not terms[0].get("user_defined") and codelist in NCI_CODELIST_EXT_CODE_IDS:
            SubElement(code_list, "Alias", {"Name": NCI_CODELIST_EXT_CODE_IDS[codelist], "Context": "nci:ExtCodeID"})
    if version in {"2.0", "2.1"}:
        optional_groups = {}
        for row in optional_code_lists:
            domain = row.get("Domain", "").strip().upper()
            variable = row.get("Variable Name", "").strip().upper()
            if domain and variable and row.get("CodedValue", "").strip():
                optional_groups.setdefault((domain, variable), []).append(row)
        for (domain, variable), rows in optional_groups.items():
            code_list = SubElement(meta, "CodeList", {"OID": f"{domain}.{variable}",
                                                        "Name": rows[0].get("CodeList", "").strip() or variable,
                                                        "DataType": "text",
                                                        f"{{{def_namespace}}}IsNonStandard": "Yes"})
            use_decodes = any(row.get("TranslatedText", "").strip() for row in rows)
            for row in rows:
                coded_value = row["CodedValue"].strip()
                if use_decodes:
                    item = SubElement(code_list, "CodeListItem", {"CodedValue": coded_value})
                    decode = SubElement(item, "Decode")
                    SubElement(decode, "TranslatedText", {"{http://www.w3.org/XML/1998/namespace}lang": "en"}).text = row.get("TranslatedText", "").strip() or coded_value
                else:
                    item = SubElement(code_list, "EnumeratedItem", {"CodedValue": coded_value})
                if row.get("Comments", "").strip():
                    SubElement(item, "Description", {"Name": "Comments", "Value": row["Comments"].strip()})
    if version in {"2.0", "2.1"}:
        for row in methods:
            method_name = row.get("Method Name", "").strip()
            method = SubElement(meta, "MethodDef", {"OID": f"MT.{method_name}", "Name": method_name, "Type": row.get("Type", "")})
            if row.get("Description"):
                description = SubElement(method, "Description")
                SubElement(description, "TranslatedText", {"{http://www.w3.org/XML/1998/namespace}lang": "en"}).text = row["Description"]
            expression = row.get("Expression Code", "").strip()
            context = row.get("Expression Context", "").strip()
            if expression:
                formal_expression = SubElement(method, "FormalExpression")
                if context:
                    formal_expression.set("Context", context)
                formal_expression.text = expression
            document = row.get("Document", "").strip() or row.get("Complex Algorithms", "").strip()
            if document:
                leaf_name = Path(document).stem.replace(" ", "") or "Document"
                document_ref = SubElement(method, "DocumentRef", {"leafID": f"LF.{leaf_name}"})
                page = row.get("Page", "").strip()
                if page:
                    document_ref.set("PageRefs", page)
                    document_ref.set("Type", "NamedDestination" if not page.isdigit() else "PhysicalRef")
        value_lists = {}
        for row in metadata:
            dataset = _dataset_code(row.get("Dataset", ""))
            variable = row.get("Variable", "").strip().upper().removeprefix(f"{dataset}.")
            if not dataset or not variable:
                continue
            value_list = value_lists.setdefault(variable, SubElement(meta, f"{{{def_namespace}}}ValueListDef", {"OID": f"VL.{dataset}.{variable}"}))
            where_variables = [value.strip().upper() for value in row.get("Where Variables", "").split(",") if value.strip()]
            where_values = [value.strip() for value in row.get("Where Values", "").split(",") if value.strip()]
            comparators = [value.strip().upper() for value in row.get("Comparator", "").split(",") if value.strip()]
            if len(comparators) == 1 and len(where_variables) > 1:
                comparators *= len(where_variables)
            value_descriptions = [value.strip() for value in row.get("Value Description", row.get("Value Desciption", "")).split(",")]
            value_name = "_".join(where_values) if where_values else variable
            item_oid = f"IT.{dataset}.{variable}.{value_name}"
            item_ref = SubElement(value_list, f"{{{def_namespace}}}ItemRef", {"ItemOID": item_oid, "OrderNumber": str(len(value_list) + 1)})
            core = row.get("Core", "").strip().upper()
            if core:
                item_ref.set("Mandatory", "Yes" if core == "REQ" else "No")
            for index, (where_variable, where_value) in enumerate(zip(where_variables, where_values)):
                where_oid = f"WC.{where_variable}.{where_value}"
                SubElement(item_ref, f"{{{def_namespace}}}WhereClauseRef", {"WhereClauseOID": where_oid})
                where_clause = SubElement(meta, f"{{{def_namespace}}}WhereClauseDef", {"OID": where_oid})
                comparator = comparators[index] if index < len(comparators) else "EQ"
                range_check = SubElement(where_clause, f"{{{def_namespace}}}RangeCheck", {"SoftHard": "Soft", "Comparator": comparator,
                                                                                              f"{{{def_namespace}}}ItemOID": f"IT.{dataset}.{where_variable}"})
                SubElement(range_check, f"{{{def_namespace}}}CheckValue").text = where_value
            attributes = {"OID": item_oid, "Name": value_name,
                          "DataType": row.get("Data Type", row.get("DataType", "text")).strip() or "text",
                          "SASFieldName": value_name}
            for source, target in (("Length", "Length"), ("Significant Digits", "SignificantDigits"), ("Format", f"{{{def_namespace}}}Format")):
                if row.get(source, "").strip():
                    attributes[target] = row[source].strip()
            item = SubElement(meta, f"{{{def_namespace}}}ItemDef", attributes)
            description = value_descriptions[0] if value_descriptions and value_descriptions[0] else value_name
            item_description = SubElement(item, "Description")
            SubElement(item_description, "TranslatedText", {"{http://www.w3.org/XML/1998/namespace}lang": "en"}).text = description
            if row.get("Origin", "").strip():
                SubElement(item, f"{{{def_namespace}}}Origin", {"Type": row["Origin"].strip()})
    output_directory.mkdir(parents=True, exist_ok=True)
    path = output_directory / "define.xml"
    ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    return path

@router.post("/{study_id}/package", response_model=TaskResponse, summary="FS23/FS29 – Generate submission package")
async def generate_submission_package(study_id: uuid.UUID, body: PackageRequest,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study: raise HTTPException(status_code=404, detail="Study not found")
    if body.define_version not in {"1.0", "2.0", "2.1"}:
        raise HTTPException(status_code=422, detail="Define XML version must be 1.0, 2.0, or 2.1")
    define_path = None
    if body.include_define_xml and body.output_format.upper() in {"SEND_DATASET", "SEND DATASET"}:
        try:
            from app.models.domain import CTMapping
            from sqlalchemy import select
            mapping_result = await db.execute(select(CTMapping).where(
                CTMapping.study_id == study_id, CTMapping.status == "Mapped"))
            controlled_terminology = [{
                "codelist": mapping.ct_codelist or mapping.variable_name,
                "code": mapping.ct_value or mapping.source_value,
                "label": mapping.source_value,
                "user_defined": (mapping.ct_codelist or mapping.variable_name).upper() in {"LBCAT", "LBSCAT", "LBMETHOD"},
            } for mapping in mapping_result.scalars().all()]
            define_path = generate_define_xml(study.pts_study_name, Path(settings.DOMAIN_OUTPUT_DIR) / str(study_id), body.define_version,
                                               controlled_terminology, study.sendig_version,
                                               body.controlled_terminology_version, body.dart_enabled,
                                               body.genetox_enabled)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    from app.workers.tasks import generate_package_task
    task = generate_package_task.delay(str(study_id), body.model_dump(), current_user.get("sub"))
    message = "Submission package generation queued"
    if define_path:
        message += f"; Define.xml {body.define_version} generated at {define_path}"
    return TaskResponse(task_id=task.id, status="queued", message=message)

@router.get("/{study_id}/audit-trail", summary="FS32 – 21 CFR Part 11 Audit Trail")
async def get_audit_trail(study_id: uuid.UUID, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy import select
    from app.models.domain import AuditLog
    result = await db.execute(select(AuditLog).where(AuditLog.study_id == study_id).order_by(AuditLog.timestamp.desc()))
    return [{"id":str(l.id),"user_id":l.user_id,"action":l.action,"resource_type":l.resource_type,
             "resource_id":l.resource_id,"reason":l.reason,"delta":l.delta,"timestamp":l.timestamp.isoformat()} for l in result.scalars().all()]

@router.get("/{study_id}/define-xml", summary="FS29 – Get Define.xml preview")
async def get_define_xml(study_id: uuid.UUID, _=Depends(get_current_user)):
    path = Path(settings.DOMAIN_OUTPUT_DIR) / str(study_id) / "define.xml"
    return {"study_id": str(study_id), "status": "ready" if path.exists() else "pending", "path": str(path) if path.exists() else None}

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
