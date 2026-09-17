"""Celery tasks for all async SEND processing"""
import asyncio, io, hashlib
import pandas as pd
from app.workers.celery_app import celery_app
from app.core.logging import logger
from app.core.config import settings

def _is_present(value):
    if value is None:
        return False
    text = str(value).strip()
    return bool(text) and text.lower() not in {"nan", "nat", "none"}

def _egstresc_ct_values() -> set[str]:
    return {value.strip().upper() for value in settings.EGSTRESC_CT_VALUES.split(",") if value.strip()}

def validate_egstresc_rows(rows: list[dict]) -> list[dict]:
    """Apply FS27.23.1: numeric EG results bypass EGSTRESC CT validation."""
    allowed_values = _egstresc_ct_values()
    issues = []
    for row_number, row in enumerate(rows, start=1):
        if _is_present(row.get("EGSTRESN")):
            continue
        character_result = str(row.get("EGSTRESC", "")).strip()
        if not character_result:
            issues.append({
                "rule_id": "FS27.23.1-EGSTRESC", "severity": "Error", "domain": "EG",
                "variable": "EGSTRESC", "message": "EGSTRESC is required when EGSTRESN is null.",
                "row_number": row_number,
            })
        elif allowed_values and character_result.upper() not in allowed_values:
            issues.append({
                "rule_id": "FS27.23.1-EGSTRESC", "severity": "Error", "domain": "EG",
                "variable": "EGSTRESC",
                "message": f"EGSTRESC value '{character_result}' is not in the EGSTRESC controlled terminology.",
                "row_number": row_number,
            })
    return issues

async def _persist_validation_results(study_id, domain_codes, issues):
    from sqlalchemy import delete
    from app.db.session import AsyncSessionLocal
    from app.models.domain import ValidationIssue
    async with AsyncSessionLocal() as db:
        await db.execute(delete(ValidationIssue).where(
            ValidationIssue.study_id == study_id,
            ValidationIssue.domain.in_(domain_codes),
        ))
        for issue in issues:
            db.add(ValidationIssue(study_id=study_id, **issue))
        await db.commit()

@celery_app.task(bind=True, name="tasks.ingest_file")
def ingest_file_task(self, study_id, filename, file_bytes, domain_hint, user_id):
    self.update_state(state="PROGRESS", meta={"step":"parsing","pct":20})
    try:
        raw = io.BytesIO(file_bytes if isinstance(file_bytes, bytes) else bytes(file_bytes))
        df = pd.read_csv(raw) if filename.endswith(".csv") else pd.read_excel(raw, engine="openpyxl")
        df.columns = [c.strip().upper().replace(" ","_") for c in df.columns]
        df = df.dropna(how="all")
        checksum = hashlib.sha256(file_bytes if isinstance(file_bytes, bytes) else bytes(file_bytes)).hexdigest()
        self.update_state(state="PROGRESS", meta={"step":"complete","pct":100})
        logger.info("ingestion.complete", study_id=study_id, rows=len(df))
        return {"status":"success","rows":len(df),"columns":list(df.columns),"checksum":checksum}
    except Exception as exc:
        logger.error("ingestion.failed", study_id=study_id, error=str(exc))
        raise

@celery_app.task(bind=True, name="tasks.transform_domains")
def transform_domains_task(self, study_id, domain_codes, output_format, user_id, derived_fields=None):
    results = {}
    for i, code in enumerate(domain_codes):
        self.update_state(state="PROGRESS", meta={"step":code,"pct":int(i/len(domain_codes)*100)})
        logger.info("transform.domain", study_id=study_id, domain=code, format=output_format)
        results[code] = {"status":"success","records":0,"format":output_format,
                 "derived_fields": derived_fields or {} if code == "DM" else {}}
    return {"status":"complete","domains":results,"derived_fields":derived_fields or {}}

@celery_app.task(bind=True, name="tasks.validate_domains")
def validate_domains_task(self, study_id, domain_codes, rule_sets, user_id):
    logger.info("validation.started", study_id=study_id, domains=domain_codes, rules=rule_sets)
    issues = []
    if "EG" in {code.upper() for code in domain_codes}:
        from sqlalchemy import select
        from app.db.session import AsyncSessionLocal
        from app.models.domain import RawMeasurement

        async def load_eg_rows():
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(RawMeasurement).where(
                    RawMeasurement.study_id == study_id,
                    RawMeasurement.measurement_type == "EG",
                ).order_by(RawMeasurement.created_at, RawMeasurement.id))
                return [row.row_data for row in result.scalars().all()]

        issues = validate_egstresc_rows(asyncio.run(load_eg_rows()))
    asyncio.run(_persist_validation_results(study_id, domain_codes, issues))
    return {"status":"complete", "errors":sum(i["severity"] == "Error" for i in issues),
            "warnings":sum(i["severity"] == "Warning" for i in issues), "issues":issues}

@celery_app.task(bind=True, name="tasks.generate_package")
def generate_package_task(self, study_id, options, user_id):
    logger.info("reports.package_started", study_id=study_id)
    return {"status":"complete","paths":{"define_xml":f"/tmp/{study_id}/define.xml","sdrg":f"/tmp/{study_id}/sdrg.html"}}
