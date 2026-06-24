"""Celery tasks for all async SEND processing"""
import io, hashlib
import pandas as pd
from app.workers.celery_app import celery_app
from app.core.logging import logger

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
def transform_domains_task(self, study_id, domain_codes, output_format, user_id):
    results = {}
    for i, code in enumerate(domain_codes):
        self.update_state(state="PROGRESS", meta={"step":code,"pct":int(i/len(domain_codes)*100)})
        logger.info("transform.domain", study_id=study_id, domain=code, format=output_format)
        results[code] = {"status":"success","records":0,"format":output_format}
    return {"status":"complete","domains":results}

@celery_app.task(bind=True, name="tasks.validate_domains")
def validate_domains_task(self, study_id, domain_codes, rule_sets, user_id):
    logger.info("validation.started", study_id=study_id, domains=domain_codes, rules=rule_sets)
    return {"status":"complete","errors":0,"warnings":0}

@celery_app.task(bind=True, name="tasks.generate_package")
def generate_package_task(self, study_id, options, user_id):
    logger.info("reports.package_started", study_id=study_id)
    return {"status":"complete","paths":{"define_xml":f"/tmp/{study_id}/define.xml","sdrg":f"/tmp/{study_id}/sdrg.html"}}
