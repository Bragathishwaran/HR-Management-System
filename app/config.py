"""Application settings loaded from environment variables / .env file."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for the WorkSphere HRMS backend."""

    app_name: str = "WorkSphere HRMS"
    environment: str = "development"

    # Security
    secret_key: str = Field(..., min_length=32, description="HS256 signing secret")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=60, ge=5, le=1440)

    # Database (async SQLite driver)
    database_url: str = "sqlite+aiosqlite:///./hrms.db"

    # CORS — React dev servers
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        """Allow CORS_ORIGINS to be supplied as a comma-separated string."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance (one parse per process)."""
    return Settings()


settings = get_settings()
