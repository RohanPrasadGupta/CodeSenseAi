import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


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

    # Env value may be a JSON list or comma-separated: https://a.app,https://b.app
    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "https://rpg-codesenseai.netlify.app",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_origins(cls, v):
        if isinstance(v, str):
            v = json.loads(v) if v.strip().startswith("[") else v.split(",")
        # a trailing slash would never match the browser's Origin header
        return [o.strip().rstrip("/") for o in v if o.strip()]

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