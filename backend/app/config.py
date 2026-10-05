from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "CodeSense AI"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    DATABASE_URL: str

    ANTHROPIC_API_KEY: str = ""
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = ""
    VOYAGE_API_KEY: str = ""
    # Voyage limits. Defaults are the free tier (no payment method); raise them
    # (e.g. 2000 / 3000000) once billing is enabled so ingest runs at full speed.
    VOYAGE_RPM: int = 3
    VOYAGE_TPM: int = 10_000

    AGENT_MODEL: str = "claude-sonnet-5-5"
    QA_MODEL: str = "claude-haiku-4-5"

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()