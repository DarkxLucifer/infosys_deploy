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
    DATABASE_URL: str = f"sqlite:///{BASE_DIR.as_posix()}/infrascan_dev.db"

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

    # Image Quality Assessment & Limits (Section 4 & 7) - Resolution limit removed
    MAX_FILE_SIZE_MB: int = 50
    MIN_LONG_SIDE: int = 0
    MIN_SHORT_SIDE: int = 0
    BLUR_WARN: float = 80.0
    BLUR_FAIL: float = 30.0
    LIGHT_WARN: float = 70.0
    LIGHT_FAIL: float = 40.0
    DUP_HAMMING_MAX: int = 5

    # Image Preprocessing (Section 5 & 7)
    PROCESSED_MAX_SIDE: int = 2048
    TILE_THRESHOLD_PX: int = 4096
    TILE_SIZE: int = 1024
    TILE_OVERLAP: float = 0.20
    PREPROCESS_TIMEOUT_S: int = 120
    PREPROCESS_NOISE_THRESHOLD: float = 8.0
    PREPROCESS_CLAHE_CLIP: float = 2.0
    PREPROCESS_CLAHE_GRID: int = 8
    PREPROCESS_SHARPEN_STRENGTH: float = 0.6

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
