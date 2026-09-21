import { prisma } from "@watch-together/database";
import { EmbeddingService, VECTOR_DIMENSION } from "./embeddingService";
import { PresenceService } from "./presenceService";

export interface RecommendationItem {
  id: string;
  slug: string;
  name: string;
  synopsis: string;
  bannerUrl: string;
  posterUrl: string;
  genres: string[];
  releaseYear: number;
  type: "MOVIE" | "SERIES";
  matchPercentage: number;
  matchReason: string;
  friendsWatchedCount: number;
}

export interface RecommendationResponse {
  titles: RecommendationItem[];
  metadata: {
    userId: string;
    algorithm: "collaborative-filtering-svd-python" | "hybrid-pgvector-social-local";
    source: "python-ml-svd" | "local-pgvector-fallback";
    userWatchedCount: number;
    friendsCount: number;
    generatedAt: number;
  };
}

const PYTHON_ML_URL = process.env.PYTHON_ML_URL || "http://localhost:8000";

export class RecommendationService {
  /**
   * Obtém sinais sociais da rede de amigos do usuário e salas ativas
   */
  private static async getSocialSignals(userId: string) {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        status: "ACCEPTED",
      },
    });

    const friendUserIds = friendships.map((f) =>
      f.senderId === userId ? f.receiverId : f.senderId
    );

    const friendsWatchedCountMap: Record<string, number> = {};

    if (friendUserIds.length > 0) {
      const friendsWatchProgresses = await prisma.watchProgress.findMany({
        where: {
          profile: {
            userId: { in: friendUserIds },
          },
        },
      });

      for (const fwp of friendsWatchProgresses) {
        friendsWatchedCountMap[fwp.titleId] = (friendsWatchedCountMap[fwp.titleId] || 0) + 1;
      }
    }

    try {
      const activeRooms = await PresenceService.getActiveRooms();
      for (const room of activeRooms) {
        if (room.mediaId) {
          friendsWatchedCountMap[room.mediaId] = (friendsWatchedCountMap[room.mediaId] || 0) + 1;
        }
      }
    } catch {
      // Ignora falha eventual de Redis/Presence
    }

    return { friendUserIds, friendsWatchedCountMap };
  }

  /**
   * Consulta a API Python (FastAPI + SVD) de Machine Learning
   */
  private static async fetchPythonMLRecommendations(
    userId: string,
    limit: number
  ): Promise<{ recommendations: any[]; algorithm: string } | null> {
    try {
      const url = `${PYTHON_ML_URL}/recommend/${encodeURIComponent(userId)}?limit=${limit}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2000), // Timeout resiliente de 2 segundos
      });

      if (!response.ok) {
        console.warn(`⚠️ [RecommendationService] API Python retornou status HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        recommendations?: any[];
        algorithm?: string;
      };

      if (data && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        return {
          recommendations: data.recommendations,
          algorithm: data.algorithm || "collaborative-filtering-svd-1536",
        };
      }

      return null;
    } catch (err: any) {
      console.warn(`⚠️ [RecommendationService] Microsserviço Python ML offline ou lento (${PYTHON_ML_URL}):`, err.message);
      return null;
    }
  }

  /**
   * Gera recomendações híbridas multivariadas com pipeline de duas camadas:
   * 1. Prioritário: Microsserviço de Machine Learning em Python (SVD Matrix Factorization)
   * 2. Fallback Resiliente: Motor Interno Fastify (pgvector HNSW Cosseno + Sinais Sociais + Heurística)
   */
  static async getHybridRecommendations(
    userId: string,
    limit = 10
  ): Promise<RecommendationResponse> {
    // 1. Busca perfil do usuário e histórico de visualização
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profiles: {
          include: {
            watchProgresses: {
              include: { title: true },
            },
          },
        },
      },
    });

    const userProfile = user?.profiles[0];
    const userWatched = userProfile?.watchProgresses || [];
    const userWatchedMap = new Map<string, { percentage: number; isFinished: boolean }>();
    for (const wp of userWatched) {
      userWatchedMap.set(wp.titleId, {
        percentage: wp.percentageCompleted,
        isFinished: wp.isFinished,
      });
    }

    // 2. Extrai sinais sociais (amigos e salas ativas)
    const { friendUserIds, friendsWatchedCountMap } = await this.getSocialSignals(userId);

    // 3. Tenta obter recomendações do microsserviço Python ML (Prioridade 1)
    const pythonResult = await this.fetchPythonMLRecommendations(userId, limit);

    if (pythonResult && pythonResult.recommendations.length > 0) {
      // Enriquece as recomendações de ML com sinais sociais em tempo real
      const enrichedTitles: RecommendationItem[] = pythonResult.recommendations.map((rec) => {
        const friendsCount = friendsWatchedCountMap[rec.id] || 0;
        let matchReason = rec.reason || "Recomendado por aprendizado de máquina (SVD)";

        if (friendsCount >= 2) {
          matchReason = `${friendsCount} amigos assistiram recentemente`;
        } else if (friendsCount === 1) {
          matchReason = "Em alta no círculo de amigos";
        }

        let matchPercentage = rec.match_percentage || 85;
        if (friendsCount > 0) {
          matchPercentage = Math.min(99, matchPercentage + Math.min(6, friendsCount * 2));
        }

        return {
          id: rec.id,
          slug: rec.slug,
          name: rec.name,
          synopsis: rec.synopsis,
          bannerUrl: rec.banner_url || rec.bannerUrl || "",
          posterUrl: rec.poster_url || rec.posterUrl || "",
          genres: rec.genres || [],
          releaseYear: rec.release_year || rec.releaseYear,
          type: rec.type,
          matchPercentage,
          matchReason,
          friendsWatchedCount: friendsCount,
        };
      });

      return {
        titles: enrichedTitles,
        metadata: {
          userId,
          algorithm: "collaborative-filtering-svd-python",
          source: "python-ml-svd",
          userWatchedCount: userWatched.length,
          friendsCount: friendUserIds.length,
          generatedAt: Date.now(),
        },
      };
    }

    // 4. Fallback Resiliente (Camada 2): pgvector HNSW + Sinais Sociais Locais
    console.log(`ℹ️ [RecommendationService] Acionando fallback pgvector HNSW local para usuário ${userId}.`);

    let tasteVector = new Array<number>(VECTOR_DIMENSION).fill(0);
    let hasTaste = false;

    if (userWatched.length > 0) {
      const watchedTitleIds = userWatched.map((w) => w.titleId);
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT "titleId", embedding::text FROM title_embeddings WHERE "titleId" = ANY($1::text[])`,
        watchedTitleIds
      );

      let totalWeight = 0;
      for (const row of rows) {
        if (!row.embedding) continue;
        const vec: number[] = JSON.parse(row.embedding);
        const wp = userWatchedMap.get(row.titleId);
        const weight = (wp?.percentage ? wp.percentage / 100 : 0.5) + 0.5;

        for (let i = 0; i < VECTOR_DIMENSION; i++) {
          tasteVector[i] += vec[i] * weight;
        }
        totalWeight += weight;
      }

      if (totalWeight > 0) {
        hasTaste = true;
        // Normaliza centroide
        let sumSq = 0;
        for (let i = 0; i < VECTOR_DIMENSION; i++) {
          tasteVector[i] /= totalWeight;
          sumSq += tasteVector[i] * tasteVector[i];
        }
        const norm = Math.sqrt(sumSq);
        if (norm > 0) {
          for (let i = 0; i < VECTOR_DIMENSION; i++) tasteVector[i] /= norm;
        }
      }
    }

    // Se usuário não tiver histórico (cold start), usa embedding padrão de ficção/aventura
    if (!hasTaste) {
      tasteVector = EmbeddingService.generateEmbedding("Ficção Científica Espacial Ação Aventura Épica");
    }

    const tasteVectorLiteral = `[${tasteVector.join(",")}]`;

    // 5. Query pgvector via índice HNSW e operador de distância de cosseno (<=>)
    const semanticCandidates: any[] = await prisma.$queryRawUnsafe(
      `
      SELECT 
        t.id, 
        t.slug, 
        t.name, 
        t.synopsis, 
        t."bannerUrl", 
        t."posterUrl", 
        t.genres, 
        t."releaseYear", 
        t.type,
        1 - (te.embedding <=> $1::vector) as semantic_similarity
      FROM titles t
      JOIN title_embeddings te ON t.id = te."titleId"
      ORDER BY te.embedding <=> $1::vector ASC
      LIMIT 25;
      `,
      tasteVectorLiteral
    );

    // 6. Calcula Popularidade Global
    const allProgresses = await prisma.watchProgress.findMany({
      select: { titleId: true },
    });
    const globalCountMap: Record<string, number> = {};
    for (const p of allProgresses) {
      globalCountMap[p.titleId] = (globalCountMap[p.titleId] || 0) + 1;
    }

    // 7. Algoritmo de Ranqueamento Híbrido Ponderado
    const scoredList: Array<RecommendationItem & { finalScore: number }> = semanticCandidates.map(
      (c) => {
        const semanticSim = Math.max(0, Math.min(1, Number(c.semantic_similarity) || 0));
        const friendsCount = friendsWatchedCountMap[c.id] || 0;
        const socialScore = Math.min(1.0, friendsCount / 3.0);
        const globalCount = globalCountMap[c.id] || 0;
        const popularityScore = Math.min(1.0, globalCount / 5.0);

        const watchedInfo = userWatchedMap.get(c.id);
        const isFinished = watchedInfo?.isFinished || false;

        // Fórmula Multivariada de Recomendação
        let rawScore =
          semanticSim * 0.45 +
          socialScore * 0.35 +
          popularityScore * 0.15 +
          (c.releaseYear >= 2025 ? 0.05 : 0.02);

        // Penalidade para não priorizar filmes que o usuário já assistiu 100%
        if (isFinished) {
          rawScore -= 0.20;
        }

        // Mapeia a pontuação composta para o padrão de match de streaming (75% a 99%)
        const matchPercentage = Math.min(99, Math.max(75, Math.round(70 + Math.max(0, rawScore) * 30)));

        // Rótulo explicativo contextual
        let matchReason = "Recomendado por afinidade temática";
        if (friendsCount >= 2) {
          matchReason = `${friendsCount} amigos assistiram recentemente`;
        } else if (friendsCount === 1) {
          matchReason = "Em alta no círculo de amigos";
        } else if (semanticSim >= 0.85) {
          matchReason = "Alta afinidade com o seu gosto";
        } else if (c.releaseYear >= 2025) {
          matchReason = "Lançamento em destaque";
        }

        return {
          id: c.id,
          slug: c.slug,
          name: c.name,
          synopsis: c.synopsis,
          bannerUrl: c.bannerUrl,
          posterUrl: c.posterUrl,
          genres: c.genres || [],
          releaseYear: c.releaseYear,
          type: c.type,
          matchPercentage,
          matchReason,
          friendsWatchedCount: friendsCount,
          finalScore: rawScore,
        };
      }
    );

    // Ordena pelo score final composto
    scoredList.sort((a, b) => b.finalScore - a.finalScore);

    const results = scoredList.slice(0, limit).map(({ finalScore, ...item }) => item);

    return {
      titles: results,
      metadata: {
        userId,
        algorithm: "hybrid-pgvector-social-local",
        source: "local-pgvector-fallback",
        userWatchedCount: userWatched.length,
        friendsCount: friendUserIds.length,
        generatedAt: Date.now(),
      },
    };
  }
}

