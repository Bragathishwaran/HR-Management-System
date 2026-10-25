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

    # Attendance rules (Module 10)
    work_start_hour: int = Field(default=9, ge=0, le=23)
    work_start_minute: int = Field(default=0, ge=0, le=59)
    late_grace_minutes: int = Field(default=15, ge=0, le=120)
    standard_work_hours: float = Field(default=8.0, gt=0, le=24)
    half_day_threshold_hours: float = Field(default=4.0, gt=0, le=24)

    # Default yearly leave allocations (Module 11)
    default_sick_leave_days: int = Field(default=12, ge=0, le=365)
    default_casual_leave_days: int = Field(default=12, ge=0, le=365)
    default_paid_leave_days: int = Field(default=20, ge=0, le=365)

    # Database (async SQLite driver)
    database_url: str = "sqlite+aiosqlite:///./hrms.db"

    # CORS — React dev servers
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:4173",
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
