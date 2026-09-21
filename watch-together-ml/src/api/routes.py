import logging
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from src.database import check_database_health
from src.recommender import recommender
from src.api.schemas import (
    HealthResponse, 
    RecommendationResponse, 
    RecommendedItemSchema, 
    RetrainResponse
)

logger = logging.getLogger("watch-together-ml.api")
router = APIRouter()

@router.get("/health", response_model=HealthResponse, tags=["Monitoramento"])
def get_health():
    """
    Verifica a integridade do microsserviço de ML, conectividade com o PostgreSQL
    e metadados do modelo de fatores latentes em memória.
    """
    db_ok = check_database_health()
    return HealthResponse(
        status="ok" if db_ok else "degraded",
        service="watch-together-ml",
        version="0.1.0",
        database_connected=db_ok,
        model_is_trained=recommender.is_trained,
        trained_users_count=len(recommender.user_ids),
        trained_items_count=len(recommender.title_ids),
        last_trained_at=recommender.last_trained_at
    )

@router.get("/recommend/{user_id}", response_model=RecommendationResponse, tags=["Recomendações"])
def get_recommendations(
    user_id: str, 
    limit: int = Query(default=10, ge=1, le=50, description="Quantidade de títulos a recomendar")
):
    """
    Gera recomendações personalizadas com base nos fatores latentes do SVD treinado
    ou fallback automático de alta relevância global (cold-start).
    """
    try:
        results = recommender.recommend(user_id=user_id, limit=limit)
        items = [RecommendedItemSchema(**item) for item in results]

        return RecommendationResponse(
            user_id=user_id,
            algorithm="collaborative-filtering-svd-1536" if recommender.is_trained and user_id in recommender.user_index_map else "catalog-cold-start",
            recommendations=items,
            total_returned=len(items)
        )
    except Exception as e:
        logger.error(f"Erro ao gerar recomendações para {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao processar recomendações: {str(e)}")

@router.post("/retrain", response_model=RetrainResponse, tags=["Treinamento"])
def trigger_retraining(background_tasks: BackgroundTasks = None):
    """
    Dispara o retreinamento síncrono do modelo SVD sobre os dados mais recentes do PostgreSQL,
    recalculando a matriz de fatores latentes e atualizando a tabela user_embeddings.
    """
    try:
        result = recommender.fit()
        if result.get("status") == "warning":
            return RetrainResponse(
                status="warning",
                message=result.get("message", "Aviso no treinamento"),
            )

        return RetrainResponse(
            status="success",
            message="Modelo SVD treinado e fatores latentes persistidos com sucesso",
            n_users=result.get("n_users"),
            n_items=result.get("n_items"),
            n_components=result.get("n_components"),
            explained_variance=result.get("explained_variance"),
            duration_seconds=result.get("duration_seconds")
        )
    except Exception as e:
        logger.error(f"Erro no pipeline de retreino: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Falha ao executar retreino: {str(e)}")
