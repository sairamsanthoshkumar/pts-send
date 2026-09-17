#!/bin/bash
echo "=== PtsSEND v2 Backend Starting ==="
echo "Starting Uvicorn on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
