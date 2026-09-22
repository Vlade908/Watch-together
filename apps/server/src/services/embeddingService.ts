import { prisma } from "@watch-together/database";

export const VECTOR_DIMENSION = 1536;

/**
 * Serviço de Geração e Gerenciamento de Embeddings Semânticos
 * Opera de forma 100% local e determinística, projetando textos
 * em um espaço vetorial de 1536 dimensões indexado por HNSW no PostgreSQL.
 */
export class EmbeddingService {
  /**
   * Gera um vetor denso unitário de 1536 dimensões a partir de um texto.
   * Utiliza projeção esparsa-para-densa por hashing com ponderação semântica
   * e normalização Euclidiana (Norma L2 = 1.0).
   */
  static generateEmbedding(text: string): number[] {
    const vector = new Array<number>(VECTOR_DIMENSION).fill(0);
    const cleaned = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentos para matching robusto
      .replace(/[^a-z0-9\s]/g, " ");

    const tokens = cleaned.split(/\s+/).filter((t) => t.length > 1);

    if (tokens.length === 0) {
      vector[0] = 1.0;
      return vector;
    }

    // Ponderação de termos temáticos e n-grams
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const weight = this.getTokenWeight(token);

      // 1-gram hash
      this.accumulateHash(vector, token, weight);

      // 2-gram hash (captura pares conceituais tipo "ficcao cientifica", "dark web", "viagem tempo")
      if (i < tokens.length - 1) {
        const bigram = `${token}_${tokens[i + 1]}`;
        this.accumulateHash(vector, bigram, weight * 1.5);
      }
    }

    // Normalização Euclidiana (L2 Norm)
    let sumSquares = 0;
    for (let i = 0; i < VECTOR_DIMENSION; i++) {
      sumSquares += vector[i] * vector[i];
    }

    const norm = Math.sqrt(sumSquares);
    if (norm > 0) {
      for (let i = 0; i < VECTOR_DIMENSION; i++) {
        vector[i] = vector[i] / norm;
      }
    } else {
      vector[0] = 1.0;
    }

    return vector;
  }

  /**
   * Pondera pesos para termos-chave do cinema/streaming
   */
  private static getTokenWeight(token: string): number {
    const highValueTerms = new Set([
      "ficcao", "cientifica", "espacial", "cyberpunk", "distopia",
      "misterio", "suspense", "acao", "drama", "universo", "galaxia",
      "buraco", "minhoca", "androide", "ia", "inteligencia", "futuro",
      "submarino", "primordial", "tempo", "quantico", "planeta", "dunas"
    ]);

    const stopWords = new Set([
      "de", "a", "o", "que", "e", "do", "da", "em", "um", "para",
      "com", "nao", "uma", "os", "no", "se", "na", "por", "mais", "as"
    ]);

    if (stopWords.has(token)) return 0.1;
    if (highValueTerms.has(token)) return 3.0;
    return 1.0;
  }

  /**
   * Projeta uma string em múltiplas posições do vetor com dispersão determinística
   */
  private static accumulateHash(vector: number[], str: string, weight: number) {
    let hash1 = 2166136261;
    let hash2 = 16777619;

    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      hash1 = (hash1 ^ code) * 16777619;
      hash2 = (hash2 ^ code) * 2166136261;
    }

    const idx1 = Math.abs(hash1) % VECTOR_DIMENSION;
    const idx2 = Math.abs(hash2) % VECTOR_DIMENSION;
    const sign1 = (hash1 & 1) === 0 ? 1 : -1;
    const sign2 = (hash2 & 1) === 0 ? 1 : -1;

    vector[idx1] += sign1 * weight;
    vector[idx2] += sign2 * (weight * 0.7);
  }

  /**
   * Indexa todos os títulos do catálogo na tabela title_embeddings
   */
  static async indexCatalogTitles(): Promise<{ indexedCount: number; totalCount: number }> {
    const titles = await prisma.title.findMany();
    let indexedCount = 0;

    for (const title of titles) {
      // Monta texto semântico abrangente
      const semanticText = `
        Título: ${title.name}.
        Tipo: ${title.type}.
        Gêneros: ${title.genres.join(", ")}.
        Sinopse: ${title.synopsis}.
        Ano: ${title.releaseYear}.
        Faixa Etária: ${title.ageRating}.
      `.trim();

      const embedding = this.generateEmbedding(semanticText);
      const vectorLiteral = `[${embedding.join(",")}]`;

      // Upsert via raw SQL com casting ::vector para indexação no pgvector
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO title_embeddings ("id", "titleId", "embedding", "modelName", "createdAt")
        VALUES (gen_random_uuid(), $1, $2::vector, 'deterministic-semantic-1536', NOW())
        ON CONFLICT ("titleId")
        DO UPDATE SET "embedding" = EXCLUDED."embedding", "modelName" = EXCLUDED."modelName", "createdAt" = NOW();
        `,
        title.id,
        vectorLiteral
      );

      indexedCount++;
    }

    console.log(`[EmbeddingService] ✓ ${indexedCount}/${titles.length} títulos indexados com HNSW.`);
    return { indexedCount, totalCount: titles.length };
  }

  /**
   * Verifica se os títulos já possuem embeddings indexados
   */
  static async isIndexPopulated(): Promise<boolean> {
    const count = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int as count FROM title_embeddings WHERE embedding IS NOT NULL;
    `;
    const num = count[0]?.count || 0;
    return num > 0;
  }
}
