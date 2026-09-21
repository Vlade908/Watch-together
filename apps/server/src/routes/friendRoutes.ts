import { FastifyInstance } from "fastify";
import { z } from "zod";
import { FriendService } from "../services/friendService";

const requestFriendSchema = z
  .object({
    targetUserId: z.string().uuid().optional(),
    targetEmail: z.string().email().optional(),
  })
  .refine((data) => data.targetUserId || data.targetEmail, {
    message: "É necessário informar targetUserId ou targetEmail.",
  });

const acceptFriendSchema = z.object({
  friendshipId: z.string().uuid("ID de solicitação inválido"),
});

const declineFriendSchema = z.object({
  friendshipId: z.string().uuid("ID de solicitação inválido"),
});

export async function friendRoutes(fastify: FastifyInstance) {
  // Todas as rotas de amizades exigem autenticação JWT
  fastify.addHook("preHandler", fastify.authenticate);

  // GET /api/friends - Lista amigos aceitos e solicitações pendentes
  fastify.get("/", async (req: any, reply) => {
    try {
      const userId = req.user.sub;
      const data = await FriendService.listFriendsAndRequests(userId);
      return reply.send(data);
    } catch (err: any) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // GET /api/friends/search?q=... - Busca usuários para adicionar
  fastify.get<{ Querystring: { q?: string } }>("/search", async (req: any, reply) => {
    try {
      const userId = req.user.sub;
      const query = req.query.q || "";
      const results = await FriendService.searchUsers(userId, query);
      return reply.send({ users: results });
    } catch (err: any) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // POST /api/friends/request - Envia solicitação de amizade
  fastify.post("/request", async (req: any, reply) => {
    const parseResult = requestFriendSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: parseResult.error.errors.map((e) => e.message),
      });
    }

    try {
      const userId = req.user.sub;
      const result = await FriendService.sendRequest(userId, parseResult.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // POST /api/friends/accept - Aceita solicitação de amizade
  fastify.post("/accept", async (req: any, reply) => {
    const parseResult = acceptFriendSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: parseResult.error.errors.map((e) => e.message),
      });
    }

    try {
      const userId = req.user.sub;
      const result = await FriendService.acceptRequest(userId, parseResult.data.friendshipId);
      return reply.send({ status: "ACCEPTED", friendship: result });
    } catch (err: any) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // POST /api/friends/decline - Recusa ou remove amizade
  fastify.post("/decline", async (req: any, reply) => {
    const parseResult = declineFriendSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: parseResult.error.errors.map((e) => e.message),
      });
    }

    try {
      const userId = req.user.sub;
      const result = await FriendService.declineOrRemove(userId, parseResult.data.friendshipId);
      return reply.send(result);
    } catch (err: any) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ error: err.message });
    }
  });
}
