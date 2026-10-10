from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./vromon.db"
    secret_key: str = "vromon-demo-secret-key"
    debug: bool = True
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    llm_api_key: str = ""
    map_api_key: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()

