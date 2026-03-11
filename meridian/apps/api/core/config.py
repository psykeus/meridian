from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    environment: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173"

    # Database
    database_url: str = "postgresql+asyncpg://meridian:meridian@localhost:5432/meridian"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Auth
    secret_key: str = "change-me-to-a-random-64-char-string"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    algorithm: str = "HS256"

    # AI / LLM
    litellm_provider: str = "ollama"
    llm_model: str = "ollama/llama3.2"
    llm_temperature: float = 0.2
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    groq_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # Feed API keys (all optional)
    acled_api_key: str = ""
    acled_email: str = ""
    alpha_vantage_api_key: str = ""
    finnhub_api_key: str = ""
    coingecko_api_key: str = ""
    nasa_api_key: str = "DEMO_KEY"
    fred_api_key: str = ""
    twitter_bearer_token: str = ""
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    spacetrack_username: str = ""
    spacetrack_password: str = ""

    # Email
    sendgrid_api_key: str = ""
    email_from: str = "noreply@meridian.local"

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # App
    app_url: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
