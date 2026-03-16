"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str  # service_role key for backend
    supabase_anon_key: str = ""
    business_timezone: str = "Asia/Kolkata"
    duplicate_threshold_seconds: int = 120
    auto_checkout_buffer_minutes: int = 30
    device_poll_interval_seconds: int = 60

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
