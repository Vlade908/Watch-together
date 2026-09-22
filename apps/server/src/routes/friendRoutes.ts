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

const removeFriendSchema = z
  .object({
    friendshipId: z.string().uuid("ID de amizade inválido").optional(),
    targetUserId: z.string().uuid("ID de usuário inválido").optional(),
  })
  .refine((data) => data.friendshipId || data.targetUserId, {
    message: "É necessário informar friendshipId ou targetUserId.",
  });

const blockUserSchema = z.object({
  targetUserId: z.string().uuid("ID de usuário inválido"),
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
      const message = status === 500 ? "Erro interno ao listar amizades." : err.message;
      return reply.status(status).send({ error: message });
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
      const message = status === 500 ? "Erro interno ao buscar usuários." : err.message;
      return reply.status(status).send({ error: message });
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
      const message = status === 500 ? "Erro interno ao enviar pedido de amizade." : err.message;
      return reply.status(status).send({ error: message });
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
      const message = status === 500 ? "Erro interno ao aceitar amizade." : err.message;
      return reply.status(status).send({ error: message });
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
      const message = status === 500 ? "Erro interno ao gerenciar amizade." : err.message;
      return reply.status(status).send({ error: message });
    }
  });

  // POST /api/friends/remove - Remove amizade existente
  fastify.post("/remove", async (req: any, reply) => {
    const parseResult = removeFriendSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: parseResult.error.errors.map((e) => e.message),
      });
    }

    try {
      const userId = req.user.sub;
      const result = await FriendService.removeFriend(userId, parseResult.data);
      return reply.send(result);
    } catch (err: any) {
      const status = err.statusCode || 500;
      const message = status === 500 ? "Erro interno ao remover amigo." : err.message;
      return reply.status(status).send({ error: message });
    }
  });

  // DELETE /api/friends/:friendshipId - Remove amizade por ID
  fastify.delete<{ Params: { friendshipId: string } }>("/:friendshipId", async (req: any, reply) => {
    try {
      const userId = req.user.sub;
      const friendshipId = req.params.friendshipId;
      const result = await FriendService.removeFriend(userId, { friendshipId });
      return reply.send(result);
    } catch (err: any) {
      const status = err.statusCode || 500;
      const message = status === 500 ? "Erro interno ao remover amigo." : err.message;
      return reply.status(status).send({ error: message });
    }
  });

  // POST /api/friends/block - Bloqueia um usuário
  fastify.post("/block", async (req: any, reply) => {
    const parseResult = blockUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: parseResult.error.errors.map((e) => e.message),
      });
    }

    try {
      const userId = req.user.sub;
      const result = await FriendService.blockUser(userId, parseResult.data.targetUserId);
      return reply.send(result);
    } catch (err: any) {
      const status = err.statusCode || 500;
      const message = status === 500 ? "Erro interno ao bloquear usuário." : err.message;
      return reply.status(status).send({ error: message });
    }
  });
}
