from fastapi import APIRouter
from app.api.v1.endpoints import (
    studies, ingestion, transformation, validation,
    reports, auth, ct, output_mapping, connection
)

api_router = APIRouter()
api_router.include_router(auth.router,           prefix="/auth",           tags=["auth"])
api_router.include_router(studies.router,        prefix="/studies",        tags=["studies"])
api_router.include_router(ingestion.router,      prefix="/ingestion",      tags=["ingestion"])
api_router.include_router(transformation.router, prefix="/transformation", tags=["transformation"])
api_router.include_router(validation.router,     prefix="/validation",     tags=["validation"])
api_router.include_router(reports.router,        prefix="/reports",        tags=["reports"])
api_router.include_router(ct.router,             prefix="/ct",             tags=["controlled-terminology"])
api_router.include_router(output_mapping.router, prefix="/output-mapping", tags=["output-mapping"])
api_router.include_router(connection.router,     prefix="/connections",    tags=["connections"])
