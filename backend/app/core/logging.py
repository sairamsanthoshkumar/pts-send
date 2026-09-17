import json, logging
from datetime import datetime, timezone
from pathlib import Path
import structlog
from app.core.config import settings

def _write_file(directory: str, filename: str, event: dict):
    path = Path(directory)
    path.mkdir(parents=True, exist_ok=True)
    with (path / filename).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(), **event}, default=str) + "\n")

def write_session_log(study_id, event: dict):
    _write_file(settings.SESSION_LOAD_DIR, f"study_{study_id}_load.jsonl", event)

def write_domain_log(study_id, event: dict):
    _write_file(Path(settings.DOMAIN_OUTPUT_DIR) / str(study_id), "output.jsonl", event)

def setup_logging():
    Path(settings.SYSTEM_LOG_DIR).mkdir(parents=True, exist_ok=True)
    structlog.configure(
        processors=[structlog.contextvars.merge_contextvars, structlog.processors.add_log_level,
                    structlog.processors.TimeStamper(fmt="iso"), structlog.dev.ConsoleRenderer()],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
                    context_class=dict, logger_factory=structlog.WriteLoggerFactory(file=open(Path(settings.SYSTEM_LOG_DIR) / "system.log", "a", encoding="utf-8")),
    )
logger = structlog.get_logger()
