import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.config import settings
from src.api.routes import router as api_router
from src.recommender import recommender

# Configuração de Logs
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s"
)
logger = logging.getLogger("watch-together-ml")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Ciclo de vida do FastAPI: executa o primeiro treino do modelo SVD
    na inicialização do servidor de forma automática.
    """
    logger.info("🚀 Inicializando Microsserviço de Machine Learning (watch-together-ml)...")
    try:
        train_result = recommender.fit()
        logger.info(f"⚡ Inicialização do SVD: {train_result.get('status')} ({train_result.get('n_users', 0)} usuários, {train_result.get('n_items', 0)} títulos)")
    except Exception as e:
        logger.warning(f"⚠️ Não foi possível treinar o modelo na inicialização: {e}")

    yield

    logger.info("Encerrando Microsserviço de Machine Learning.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Microsserviço de Recomendação com Fatores Latentes (SVD) e pgvector para o Watch Together",
    lifespan=lifespan
)

# CORS aberto para comunicação com o gateway Fastify e frontend Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registra endpoints
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host=settings.HOST, port=settings.PORT, reload=True)
