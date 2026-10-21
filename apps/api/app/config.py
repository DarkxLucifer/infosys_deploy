import secrets
from pathlib import Path
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    APP_BASE_URL: str = "http://localhost:5173"
    API_BASE_URL: str = "http://localhost:8000"
    SUPPORT_EMAIL: Optional[str] = "support@infrascan.local"

    # Database
    DATABASE_URL: str = "sqlite:///./infrascan_dev.db"

    # Security
    JWT_SECRET: str = secrets.token_hex(32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

    # SMTP (Mailpit defaults)
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    MAIL_FROM: str = "no-reply@infrascan.local"
    SMTP_STARTTLS: bool = False

    # OAuth Providers
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    MICROSOFT_CLIENT_ID: Optional[str] = None
    MICROSOFT_CLIENT_SECRET: Optional[str] = None

    # Setup Token (Generated on start if no admin exists, Section S.5)
    SETUP_TOKEN: str = secrets.token_urlsafe(32)

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR.parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def configured_oauth_providers(self) -> List[str]:
        providers = []
        if self.GOOGLE_CLIENT_ID and self.GOOGLE_CLIENT_SECRET:
            providers.append("google")
        if self.MICROSOFT_CLIENT_ID and self.MICROSOFT_CLIENT_SECRET:
            providers.append("microsoft")
        return providers

settings = Settings()
