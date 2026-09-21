import time
import logging
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional
from sklearn.decomposition import TruncatedSVD
from sqlalchemy import text
from src.database import engine
from src.data_loader import DataLoader
from src.config import settings

logger = logging.getLogger("watch-together-ml.recommender")

class RecommenderEngine:
    """
    Motor de Recomendação baseado em Fatores Latentes (TruncatedSVD)
    com projeção em 1536 dimensões normalizadas L2 compatíveis com o pgvector.
    """

    def __init__(self):
        self.is_trained: bool = False
        self.last_trained_at: Optional[float] = None
        self.model: Optional[TruncatedSVD] = None
        self.user_ids: List[str] = []
        self.title_ids: List[str] = []
        self.user_index_map: Dict[str, int] = {}
        self.title_index_map: Dict[str, int] = {}
        self.predicted_matrix: Optional[np.ndarray] = None
        self.original_matrix: Optional[pd.DataFrame] = None
        self.titles_df: Optional[pd.DataFrame] = None
        self.explained_variance_sum: float = 0.0

    def fit(self) -> Dict[str, Any]:
        """
        Executa o treinamento do modelo SVD sobre os dados de interações do PostgreSQL
        e grava os fatores latentes na tabela user_embeddings.
        """
        logger.info("Iniciando pipeline de treinamento do modelo SVD...")
        start_time = time.time()

        df_interactions = DataLoader.load_interactions()
        self.titles_df = DataLoader.load_titles()

        if df_interactions.empty or len(df_interactions) < 2:
            logger.warning("Interações insuficientes para treinamento de SVD. Ativando fallback de catálogo.")
            self.is_trained = False
            return {
                "status": "warning",
                "message": "Dados insuficientes para treino",
                "interactions_count": len(df_interactions)
            }

        # Cria a matriz pivô Usuário x Título
        pivot_df = df_interactions.pivot(index="user_id", columns="title_id", values="rating").fillna(0.0)

        self.user_ids = list(pivot_df.index)
        self.title_ids = list(pivot_df.columns)
        self.user_index_map = {uid: idx for idx, uid in enumerate(self.user_ids)}
        self.title_index_map = {tid: idx for idx, tid in enumerate(self.title_ids)}
        self.original_matrix = pivot_df

        n_users, n_items = pivot_df.shape
        # Número de componentes latentes (k): no máximo min(n_users - 1, n_items - 1, 10, 4)
        n_components = max(1, min(n_users - 1, n_items - 1, 8))

        logger.info(f"Treinando TruncatedSVD com k={n_components} para {n_users} usuários e {n_items} títulos...")
        self.model = TruncatedSVD(n_components=n_components, random_state=42)
        user_factors = self.model.fit_transform(pivot_df.values)  # Formato: (n_users, n_components)
        item_factors = self.model.components_                    # Formato: (n_components, n_items)

        # Matriz reconstruída de predições
        self.predicted_matrix = np.dot(user_factors, item_factors)
        self.explained_variance_sum = float(np.sum(self.model.explained_variance_ratio_))

        # Projeta os fatores latentes em 1536 dimensões e persiste em user_embeddings no PostgreSQL
        self._persist_user_embeddings(user_factors)

        self.is_trained = True
        self.last_trained_at = time.time()
        elapsed = round(time.time() - start_time, 3)

        logger.info(f"✓ Treinamento concluído com sucesso em {elapsed}s. Variância explicada: {self.explained_variance_sum:.2%}")

        return {
            "status": "success",
            "n_users": n_users,
            "n_items": n_items,
            "n_components": n_components,
            "explained_variance": self.explained_variance_sum,
            "duration_seconds": elapsed,
            "trained_at": self.last_trained_at
        }

    def _persist_user_embeddings(self, user_factors: np.ndarray):
        """
        Projeta os fatores latentes para 1536 dimensões com normalização L2
        e salva na tabela user_embeddings do PostgreSQL.
        """
        dim_target = settings.LATENT_FACTORS_DIM
        n_users, n_components = user_factors.shape

        # Matriz de projeção determinística pseudo-aleatória fixa
        rng = np.random.RandomState(42)
        projection_matrix = rng.randn(n_components, dim_target)

        with engine.begin() as conn:
            for i, user_id in enumerate(self.user_ids):
                latent_vector = user_factors[i]
                # Projeta para 1536 dimensões
                dense_1536 = np.dot(latent_vector, projection_matrix)

                # Normalização L2
                norm = np.linalg.norm(dense_1536)
                if norm > 0:
                    dense_1536 = dense_1536 / norm
                else:
                    dense_1536[0] = 1.0

                vec_str = "[" + ",".join(f"{val:.6f}" for val in dense_1536) + "]"

                sql = text("""
                    INSERT INTO user_embeddings ("id", "userId", embedding, "modelName", "updatedAt")
                    VALUES (gen_random_uuid(), :user_id, CAST(:embedding AS vector), 'svd-latent-factors-1536', NOW())
                    ON CONFLICT ("userId")
                    DO UPDATE SET embedding = EXCLUDED.embedding, "modelName" = EXCLUDED."modelName", "updatedAt" = NOW();
                """)
                conn.execute(sql, {"user_id": user_id, "embedding": vec_str})

        logger.info(f"✓ {n_users} embeddings de fatores latentes persistidos na tabela user_embeddings com HNSW.")

    def recommend(self, user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Retorna os títulos recomendados ordenados por score previsto para um usuário.
        """
        if self.titles_df is None or self.titles_df.empty:
            self.titles_df = DataLoader.load_titles()

        titles_dict = {row["id"]: row for row in self.titles_df.to_dict(orient="records")}

        # 1. Caso o usuário esteja na matriz treinada do SVD
        if self.is_trained and user_id in self.user_index_map and self.predicted_matrix is not None:
            user_idx = self.user_index_map[user_id]
            user_predictions = self.predicted_matrix[user_idx]
            original_ratings = self.original_matrix.values[user_idx] if self.original_matrix is not None else []

            recommendations = []
            for item_idx, title_id in enumerate(self.title_ids):
                pred_rating = float(user_predictions[item_idx])
                orig_rating = float(original_ratings[item_idx]) if len(original_ratings) > item_idx else 0.0
                is_already_watched = orig_rating > 0.0

                # Score composto: prioriza itens não assistidos ou altamente cotados
                effective_score = pred_rating - (1.0 if is_already_watched else 0.0)
                # Percentual de match amigável de streaming (75% a 99%)
                match_pct = int(np.clip(70 + (pred_rating / 5.0) * 28, 75, 99))

                title_info = titles_dict.get(title_id)
                if title_info is None:
                    continue

                reason = "Recomendado por fatores latentes de perfil (SVD)"
                if is_already_watched:
                    reason = "Porque você gostou deste título"
                elif pred_rating >= 4.0:
                    reason = "Alta afinidade prevista pelo modelo ML"

                recommendations.append({
                    "id": title_id,
                    "slug": title_info["slug"],
                    "name": title_info["name"],
                    "synopsis": title_info["synopsis"],
                    "genres": title_info["genres"] if isinstance(title_info["genres"], list) else [],
                    "banner_url": title_info["banner_url"],
                    "poster_url": title_info["poster_url"],
                    "release_year": int(title_info["release_year"]),
                    "type": title_info["type"],
                    "predicted_rating": round(pred_rating, 2),
                    "match_percentage": match_pct,
                    "reason": reason,
                    "score": effective_score
                })

            recommendations.sort(key=lambda x: x["score"], reverse=True)
            return recommendations[:limit]

        # 2. Caso Cold Start (Usuário novo ou sem histórico no SVD)
        logger.info(f"Usuário {user_id} em Cold Start. Usando ranking global de catálogo.")
        fallback_recs = []
        for title in self.titles_df.to_dict(orient="records"):
            fallback_recs.append({
                "id": title["id"],
                "slug": title["slug"],
                "name": title["name"],
                "synopsis": title["synopsis"],
                "genres": title["genres"] if isinstance(title["genres"], list) else [],
                "banner_url": title["banner_url"],
                "poster_url": title["poster_url"],
                "release_year": int(title["release_year"]),
                "type": title["type"],
                "predicted_rating": 4.5,
                "match_percentage": 82 if title["release_year"] >= 2025 else 78,
                "reason": "Destaque global no catálogo do streaming",
                "score": 4.5
            })

        fallback_recs.sort(key=lambda x: (x["release_year"], x["match_percentage"]), reverse=True)
        return fallback_recs[:limit]

# Instância Singleton do motor
recommender = RecommenderEngine()
