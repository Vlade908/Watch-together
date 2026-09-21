import logging
import pandas as pd
from sqlalchemy import text
from src.database import engine

logger = logging.getLogger("watch-together-ml.data_loader")

class DataLoader:
    """
    Responsável por extrair do PostgreSQL as interações explícitas e implícitas
    dos usuários, consolidando-as em uma matriz de avaliações (1.0 a 5.0).
    """

    @classmethod
    def load_interactions(cls) -> pd.DataFrame:
        """
        Carrega e unifica as avaliações explícitas (user_ratings) e
        o progresso de streaming (watch_progress) ponderado.
        """
        with engine.connect() as conn:
            # 1. Avaliações Explícitas (user_ratings: 1.0 a 5.0)
            ratings_query = text("""
                SELECT 
                    "userId" as user_id, 
                    "titleId" as title_id, 
                    rating::float as rating,
                    1.0 as weight
                FROM user_ratings;
            """)
            df_ratings = pd.read_sql(ratings_query, conn)

            # 2. Feedback Implícito de Streaming (watch_progress mapeado para 1.0 - 5.0)
            progress_query = text("""
                SELECT 
                    p."userId" as user_id,
                    wp."titleId" as title_id,
                    LEAST(5.0, GREATEST(1.0, 1.0 + (wp."percentageCompleted" / 100.0) * 4.0)) as rating,
                    0.6 as weight
                FROM watch_progress wp
                JOIN profiles p ON wp."profileId" = p.id
                WHERE wp."percentageCompleted" > 0;
            """)
            df_progress = pd.read_sql(progress_query, conn)

        # Concatena ambos os dataframes
        df_combined = pd.concat([df_ratings, df_progress], ignore_index=True)

        if df_combined.empty:
            logger.warning("Nenhuma interação de usuário encontrada no banco de dados.")
            return pd.DataFrame(columns=["user_id", "title_id", "rating"])

        # Agrega interações duplicadas através de média ponderada
        def weighted_avg(group):
            return (group["rating"] * group["weight"]).sum() / group["weight"].sum()

        df_aggregated = (
            df_combined.groupby(["user_id", "title_id"])
            .apply(weighted_avg, include_groups=False)
            .reset_index(name="rating")
        )

        logger.info(f"Carregadas {len(df_aggregated)} interações únicas de {df_aggregated['user_id'].nunique()} usuários.")
        return df_aggregated

    @classmethod
    def load_titles(cls) -> pd.DataFrame:
        """
        Carrega o catálogo completo de títulos com metadados do banco.
        """
        with engine.connect() as conn:
            query = text("""
                SELECT 
                    id, 
                    slug, 
                    name, 
                    synopsis, 
                    genres, 
                    "bannerUrl" as banner_url, 
                    "posterUrl" as poster_url, 
                    "releaseYear" as release_year, 
                    type
                FROM titles;
            """)
            df_titles = pd.read_sql(query, conn)
        return df_titles
