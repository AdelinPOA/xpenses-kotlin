import json
import secrets

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    cors_origins: list[str] = ["http://localhost:3000"]
    data_dir: str = "/app/data"
    default_currency: str = "EUR"
    database_url: str = "postgresql://xpenses:xpenses@localhost:5432/xpenses"
    company_name: str = "Newtech Automation"
    submitter_name: str = "Popescu Adelin"
    submitter_email: str = "adelin.popescu@nt-automation.eu"

    jwt_secret: str = secrets.token_hex(32)
    jwt_access_expires_minutes: int = 15
    jwt_refresh_expires_days: int = 7
    cookie_secure: bool = True
    seed_demo_users: bool = False
    ocr_enabled: bool = True
    ocr_languages: str = "en,ro"
    mileage_rate_before_tax: float = 0.60
    mileage_rate_after_tax: float = 0.40

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str | None = None
    smtp_pass: str | None = None
    smtp_from: str = "noreply@nt-automation.eu"
    emails_enabled: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list) -> list[str]:
        if isinstance(v, str):
            v_stripped = v.strip()
            if v_stripped.startswith("["):
                return json.loads(v_stripped)
            return [origin.strip() for origin in v_stripped.split(",") if origin.strip()]
        return v

    @property
    def receipts_dir(self) -> str:
        return f"{self.data_dir}/receipts"

    @property
    def signatures_dir(self) -> str:
        return f"{self.data_dir}/signatures"


settings = Settings()
