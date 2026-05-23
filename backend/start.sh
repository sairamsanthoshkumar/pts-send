#!/bin/bash
set -e

echo "=== PtsSEND Backend Starting ==="

# Start Celery worker in background — failures won't kill FastAPI
celery -A app.workers.celery_app worker --loglevel=info --concurrency=2 &
CELERY_PID=$!
echo "Celery worker started (PID $CELERY_PID)"

# Give celery a moment to start
sleep 2

# Start FastAPI — this is the main process
echo "Starting FastAPI..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
