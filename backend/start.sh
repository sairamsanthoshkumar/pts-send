#!/bin/bash
echo "=== PtsSEND v2 Backend Starting ==="
celery -A app.workers.celery_app worker --loglevel=info --concurrency=2 &
echo "Celery PID: $!"
echo "Starting Uvicorn on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
