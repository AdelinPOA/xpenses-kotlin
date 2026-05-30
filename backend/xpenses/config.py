from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    cors_origins: list[str] = ["http://localhost:3000"]
    data_dir: str = "/app/data"
    default_currency: str = "EUR"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list) -> list[str]:
        if isinstance(v, str):
            return json.loads(v)
        return v

    @property
    def db_path(self) -> str:
        return f"{self.data_dir}/xpenses.db"

    @property
    def receipts_dir(self) -> str:
        return f"{self.data_dir}/receipts"


settings = Settings()
