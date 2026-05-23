#!/bin/bash
set -e

echo "Starting PtsSEND backend..."

# Start Celery worker in background
celery -A app.workers.celery_app worker --loglevel=info --concurrency=2 &
echo "Celery worker started (PID $!)"

# Start FastAPI in foreground (keeps container alive)
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
