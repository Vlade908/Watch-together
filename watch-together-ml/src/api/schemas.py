from typing import List, Optional
from pydantic import BaseModel, Field

class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "watch-together-ml"
    version: str = "0.1.0"
    database_connected: bool
    model_is_trained: bool
    trained_users_count: int
    trained_items_count: int
    last_trained_at: Optional[float] = None

class RecommendedItemSchema(BaseModel):
    id: str
    slug: str
    name: str
    synopsis: str
    genres: List[str]
    banner_url: str
    poster_url: str
    release_year: int
    type: str
    predicted_rating: float
    match_percentage: int
    reason: str

class RecommendationResponse(BaseModel):
    user_id: str
    algorithm: str = "collaborative-filtering-svd-1536"
    recommendations: List[RecommendedItemSchema]
    total_returned: int

class RetrainResponse(BaseModel):
    status: str
    message: str
    n_users: Optional[int] = None
    n_items: Optional[int] = None
    n_components: Optional[int] = None
    explained_variance: Optional[float] = None
    duration_seconds: Optional[float] = None
