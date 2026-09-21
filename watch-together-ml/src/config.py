import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "Watch Together ML Recommender API"
    VERSION: str = "0.1.0"
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+psycopg://postgres:postgres@localhost:5432/watch_together"
    )
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "info")
    LATENT_FACTORS_DIM: int = 1536

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
