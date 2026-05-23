from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "change-me-in-production-use-long-random-string"
    APP_DEBUG: bool = False

    # Database — Render injects DATABASE_URL automatically
    DATABASE_URL: str = "postgresql+asyncpg://ptssend:ptssend@localhost:5432/ptssend"

    @property
    def DATABASE_URL_SYNC(self) -> str:
        return self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

    # Redis — Render injects REDIS_URL automatically
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    # CORS — set to your Render frontend URL in production
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000", "https://pts-send-frontend.onrender.com"]
    FRONTEND_URL: str = ""

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Storage (local fallback uses /tmp)
    STORAGE_BACKEND: str = "local"

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
