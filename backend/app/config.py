"""Application settings, loaded from environment (.env supported).

The `.env` path is resolved absolutely (backend/.env) so settings load no
matter which directory you launch uvicorn from.
"""
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), env_file_encoding="utf-8", extra="ignore")

    # Default is a local SQLite file; override with Postgres in Docker/production.
    database_url: str = "sqlite:///./jaikvin.db"
    # Comma-separated list of allowed browser origins for CORS.
    cors_origins: str = "http://localhost:5173,http://localhost:4173,http://localhost:8090"
    app_name: str = "Jaikvin Global Export System API"

    # Dev server bind — change API_PORT in .env to switch ports easily.
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    reload: bool = Field(default=True)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
