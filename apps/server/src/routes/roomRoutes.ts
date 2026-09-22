import { FastifyInstance } from "fastify";
import { z } from "zod";
import { RoomService } from "../services/roomService";
import { MediaSourceType } from "../types";
import { isValidMediaUrl } from "../utils/urlValidator";

const createRoomSchema = z.object({
  roomId: z.string().min(3).max(100),
  mediaId: z.string().max(100).optional(),
  sourceType: z.enum(["LOCAL_FILE", "DIRECT_URL", "CATALOG_DEMO"]).optional(),
  mediaTitle: z.string().max(150).optional(),
  directUrl: z
    .string()
    .max(2048)
    .optional()
    .refine((url) => !url || isValidMediaUrl(url), {
      message: "A URL de mídia direta deve usar obrigatoriamente protocolo HTTP ou HTTPS válido.",
    }),
});

export async function roomRoutes(fastify: FastifyInstance) {
  // POST /api/rooms - Inicializa ou reivindica a sala para o Host autenticado
  fastify.post("/", { preHandler: [fastify.authenticate] }, async (req: any, reply) => {
    const parseResult = createRoomSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: parseResult.error.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
      });
    }

    try {
      const { roomId, mediaId, sourceType, mediaTitle, directUrl } = parseResult.data;
      const hostId = req.user.sub;
      const hostName = req.user.name || "Host";

      const roomState = await RoomService.createOrClaimRoom(roomId, hostId, hostName, {
        mediaId,
        sourceType: sourceType as MediaSourceType,
        mediaTitle,
        directUrl,
      });

      return reply.status(201).send({ ok: true, room: roomState });
    } catch (err: any) {
      const status = err.statusCode || 500;
      const message = status === 500 ? "Erro interno ao inicializar sala." : err.message;
      return reply.status(status).send({ error: message });
    }
  });

  // GET /api/rooms/:roomId - Consulta metadados da sala
  fastify.get<{ Params: { roomId: string } }>("/:roomId", async (req, reply) => {
    try {
      const state = await RoomService.getRoomState(req.params.roomId);
      if (!state) {
        return reply.status(404).send({ error: "Sala não encontrada" });
      }
      return reply.send({ ok: true, room: state });
    } catch (err: any) {
      const status = err.statusCode || 500;
      const message = status === 500 ? "Erro interno ao consultar sala." : err.message;
      return reply.status(status).send({ error: message });
    }
  });
}
