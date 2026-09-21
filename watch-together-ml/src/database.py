import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from src.config import settings

logger = logging.getLogger("watch-together-ml.database")

# Garante que o driver psycopg (v3) seja usado se a URL começar com postgresql://
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(
    db_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    future=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def check_database_health() -> bool:
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1;"))
            return result.scalar() == 1
    except Exception as e:
        logger.error(f"Erro no healthcheck do banco de dados: {e}")
        return False
