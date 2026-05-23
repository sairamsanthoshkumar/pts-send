import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.db.session import get_db
from app.schemas.study import TaskResponse

router = APIRouter()

@router.post("/{study_id}/upload", response_model=TaskResponse)
async def upload_raw_file(study_id: uuid.UUID, file: UploadFile = File(...), domain_hint: str = Form("AUTO"), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.models.study import Study
    study = await db.get(Study, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    from app.workers.tasks import ingest_file_task
    task = ingest_file_task.delay(str(study_id), file.filename, domain_hint, current_user.get("sub"))
    return TaskResponse(task_id=task.id, status="queued", message=f"Ingestion queued for {file.filename}")

@router.get("/task/{task_id}")
async def get_task_status(task_id: str, _=Depends(get_current_user)):
    from app.workers.celery_app import celery_app
    result = celery_app.AsyncResult(task_id)
    return {"task_id": task_id, "status": result.status, "result": result.result if result.ready() else None}
