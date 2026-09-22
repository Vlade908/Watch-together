import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
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
import { roomRoutes } from "./routes/roomRoutes";

import { PartyService } from "./services/partyService";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
}

dotenv.config();

const PORT = parseInt(process.env.PORT || "4000", 10);
const HOST = process.env.HOST || "::";

// VULN-11: Bloqueio estrito de segredos JWT inseguros/padrão em ambiente de produção
const jwtSecret = process.env.JWT_SECRET || "super-secret-watch-together-key-change-in-production";
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && (!process.env.JWT_SECRET || jwtSecret.includes("super-secret") || jwtSecret.length < 32)) {
  console.error("❌ [FATAL] JWT_SECRET não configurado adequadamente para o ambiente de produção (mínimo de 32 caracteres seguros exigido).");
  process.exit(1);
}

const fastify = Fastify({
  logger: {
    level: isProduction ? "info" : "warn",
  },
  requestIdHeader: "x-request-id",
  genReqId: () => `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
});

// VULN-07: Sanitizador Global de Erros - Oculta stack traces, dados do Prisma e detalhes internos em respostas 500
fastify.setErrorHandler((error: any, request, reply) => {
  request.log.error({ err: error, reqId: request.id }, "Erro não tratado capturado no Fastify Gateway");

  if (error.validation) {
    return reply.status(400).send({
      statusCode: 400,
      error: "Bad Request",
      message: "Dados de requisição inválidos ou fora do schema esperado.",
      requestId: request.id,
    });
  }

  const statusCode =
    error.statusCode && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500;

  if (statusCode === 500) {
    return reply.status(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Ocorreu um erro interno no servidor. Por favor, tente novamente mais tarde.",
      requestId: request.id,
    });
  }

  return reply.status(statusCode).send({
    statusCode,
    error: error.name || "Error",
    message: error.message || "Erro no processamento da solicitação.",
    requestId: request.id,
  });
});

async function main() {
  // VULN-02: Política Restrita de CORS baseada em lista de origens autorizadas (sem wildcard com credenciais)
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim().replace(/\/$/, ""))
    : [
        (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, ""),
        "http://127.0.0.1:3000",
      ];

  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Permite requisições sem cabeçalho Origin (serviços server-to-server, curl, healthchecks)
      if (!origin) return cb(null, true);
      const normalizedOrigin = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalizedOrigin)) {
        return cb(null, true);
      }
      return cb(new Error("CORS: Origem não permitida pela política de segurança."), false);
    },
    credentials: true,
    allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization", "X-Admin-Key"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  // VULN-03: Rate Limiting Global no Gateway HTTP (Prevenção de DoS e Força Bruta)
  await fastify.register(rateLimit, {
    max: 120, // 120 requisições por minuto por IP globalmente
    timeWindow: "1 minute",
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Limite de taxa de requisições excedido. Tente novamente em ${context.after}.`,
    }),
  });

  await fastify.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
      clientTracking: true,
    },
  });

  await fastify.register(jwt, {
    secret: jwtSecret,
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

  // VULN-06: Endpoint administrativo /reindex protegido com JWT e validação de perfil/chave de administrador
  fastify.post(
    "/api/recommendations/reindex",
    { preHandler: [fastify.authenticate] },
    async (req: any, reply) => {
      const adminSecret = process.env.ADMIN_SECRET_KEY;
      const headerKey = req.headers["x-admin-key"];
      const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());
      const userEmail = req.user?.email ? String(req.user.email).toLowerCase() : "";

      const isAuthorizedAdmin =
        (adminSecret && headerKey === adminSecret) ||
        (adminEmails.length > 0 && adminEmails.includes(userEmail)) ||
        req.user?.role === "ADMIN";

      if (!isAuthorizedAdmin) {
        return reply.status(403).send({
          error: "Acesso Proibido",
          message: "Apenas administradores autorizados têm permissão para reindexar o catálogo vetorial.",
        });
      }

      try {
        const result = await EmbeddingService.indexCatalogTitles();
        return { status: "ok", message: "Catálogo indexado com sucesso", ...result };
      } catch (err: any) {
        return reply.status(500).send({ error: "Falha ao reindexar embeddings", details: err.message });
      }
    }
  );

  fastify.get("/api/titles", async () => {
    const titles = await prisma.title.findMany({
      include: {
        mediaAsset: true,
      },
    });
    return { titles };
  });

  // 6. Rotas de Autenticação, Gestão de Amizades e Salas Síncronas
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(friendRoutes, { prefix: "/api/friends" });
  await fastify.register(roomRoutes, { prefix: "/api/rooms" });

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
