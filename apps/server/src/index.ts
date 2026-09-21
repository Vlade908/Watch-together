import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import dotenv from "dotenv";
import { PubSubService } from "./services/pubsubService";
import { PresenceService } from "./services/presenceService";
import { handleRoomWebSocket } from "./websocket/handler";
import { handleSocialWebSocket } from "./websocket/socialHandler";
import { redisClient } from "./redis/client";
import { prisma } from "@watch-together/database";
import { EmbeddingService } from "./services/embeddingService";
import { RecommendationService } from "./services/recommendationService";

import jwt from "@fastify/jwt";
import { authRoutes } from "./routes/authRoutes";
import { friendRoutes } from "./routes/friendRoutes";

import { PartyService } from "./services/partyService";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
}

dotenv.config();

const PORT = parseInt(process.env.PORT || "4000", 10);
const HOST = process.env.HOST || "::";

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "warn",
  },
});

async function main() {
  // 1. Plugins de CORS, WebSockets e JWT
  await fastify.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  await fastify.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
      clientTracking: true,
    },
  });

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || "super-secret-watch-together-key-change-in-production",
  });

  fastify.decorate("authenticate", async function (req: any, reply: any) {
    try {
      await req.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: "Token de autenticação inválido ou ausente." });
    }
  });

  // 2. Inicializa o barramento de eventos Redis Pub/Sub, Presença Social e Party Lobby
  PubSubService.init();
  PresenceService.init();
  PartyService.init();

  // 3. Inicializa e indexa embeddings com pgvector se necessário
  try {
    const isPopulated = await EmbeddingService.isIndexPopulated();
    if (!isPopulated) {
      console.log("⚡ [EmbeddingService] Tabela title_embeddings vazia. Gerando embeddings determinísticos locais...");
      await EmbeddingService.indexCatalogTitles();
    } else {
      console.log("⚡ [EmbeddingService] Índice HNSW pgvector já populado no PostgreSQL.");
    }
  } catch (err: any) {
    console.warn("⚠️ [EmbeddingService] Aviso na inicialização de embeddings:", err.message);
  }

  // 4. Endpoint de Health Check
  fastify.get("/health", async () => {
    const redisPing = await redisClient.ping();
    return {
      status: "ok",
      service: "@watch-together/server",
      redis: redisPing === "PONG" ? "healthy" : "degraded",
      port: PORT,
      timestamp: Date.now(),
    };
  });

  // 5. Endpoints REST da Inteligência Semântica & Catálogo
  fastify.get<{ Querystring: { userId?: string; limit?: string } }>(
    "/api/recommendations",
    async (req, reply) => {
      try {
        const userId = req.query.userId || "user-default";
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
        const recommendations = await RecommendationService.getHybridRecommendations(userId, limit);
        return recommendations;
      } catch (err: any) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Falha ao gerar recomendações", details: err.message });
      }
    }
  );

  fastify.post("/api/recommendations/reindex", async (req, reply) => {
    try {
      const result = await EmbeddingService.indexCatalogTitles();
      return { status: "ok", message: "Catálogo indexado com sucesso", ...result };
    } catch (err: any) {
      return reply.status(500).send({ error: "Falha ao reindexar embeddings", details: err.message });
    }
  });

  fastify.get("/api/titles", async () => {
    const titles = await prisma.title.findMany({
      include: {
        mediaAsset: true,
      },
    });
    return { titles };
  });

  // 6. Rotas de Autenticação e Gestão de Amizades
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(friendRoutes, { prefix: "/api/friends" });

  // 7. Rotas WebSocket com captura dinâmica e suporte a subprotocolos
  fastify.register(async function (fastifyInstance) {
    // Sala de Reprodução Síncrona (captura qualquer slug dinâmico, ex: sala-interestelar-alem-do-horizonte-6l33)
    fastifyInstance.get(
      "/ws/rooms/:roomId",
      { websocket: true },
      (socket, req) => {
        handleRoomWebSocket(socket, req as any);
      }
    );

    // Canal Social Global (Presença, Convites e Salas Ativas)
    fastifyInstance.get(
      "/ws/social",
      { websocket: true },
      (socket, req) => {
        handleSocialWebSocket(socket, req as any);
      }
    );
  });

  // 5. Inicialização do servidor com dual-stack (IPv6 + IPv4) resiliente
  try {
    const address = await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 [Watch Together Gateway] Servidor Fastify ativo em ${address}`);
    console.log(`🔌 [WebSockets] Endpoint salas: ws://localhost:${PORT}/ws/rooms/:roomId`);
    console.log(`🔌 [WebSockets] Endpoint social: ws://localhost:${PORT}/ws/social\n`);
  } catch (err: any) {
    if (HOST === "::") {
      console.warn(`[Fastify] IPv6 '::' falhou (${err.message}). Tentando fallback em '0.0.0.0'...`);
      const address = await fastify.listen({ port: PORT, host: "0.0.0.0" });
      console.log(`\n🚀 [Watch Together Gateway] Servidor Fastify ativo em ${address}`);
      console.log(`🔌 [WebSockets] Endpoint salas: ws://localhost:${PORT}/ws/rooms/:roomId`);
      console.log(`🔌 [WebSockets] Endpoint social: ws://localhost:${PORT}/ws/social\n`);
    } else {
      fastify.log.error(err);
      process.exit(1);
    }
  }
}

main();
