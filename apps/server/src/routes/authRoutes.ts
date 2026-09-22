import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/authService";

const registerSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter no mínimo 2 caracteres").max(60),
  email: z.string().trim().toLowerCase().email("Endereço de e-mail inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres").max(100),
  avatarUrl: z.string().url("URL de avatar inválida").optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Endereço de e-mail inválido"),
  password: z.string().min(1, "A senha é obrigatória"),
});

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/register (VULN-03: Rate limit restrito contra bots de registro)
  fastify.post(
    "/register",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const parseResult = registerSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Dados inválidos",
          details: parseResult.error.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
        });
      }

      try {
        const user = await AuthService.register(parseResult.data);
        const token = fastify.jwt.sign(
          {
            sub: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
          { expiresIn: "7d" }
        );

        return reply.status(201).send({
          user,
          token,
        });
      } catch (err: any) {
        const status = err.statusCode || 500;
        const message = status === 500 ? "Erro interno ao processar cadastro." : err.message;
        return reply.status(status).send({ error: message });
      }
    }
  );

  // POST /api/auth/login (VULN-03: Rate limit restrito contra ataques de força bruta)
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Dados inválidos",
          details: parseResult.error.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
        });
      }

      try {
        const user = await AuthService.login(parseResult.data);
        const token = fastify.jwt.sign(
          {
            sub: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
          { expiresIn: "7d" }
        );

        return reply.send({
          user,
          token,
        });
      } catch (err: any) {
        const status = err.statusCode || 500;
        const message = status === 500 ? "Erro interno ao processar login." : err.message;
        return reply.status(status).send({ error: message });
      }
    }
  );

  // GET /api/auth/me (Rota protegida)
  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (req: any, reply) => {
      try {
        const userId = req.user.sub;
        const profile = await AuthService.getUserProfile(userId);
        return reply.send({ user: profile });
      } catch (err: any) {
        const status = err.statusCode || 500;
        const message = status === 500 ? "Erro interno ao consultar perfil." : err.message;
        return reply.status(status).send({ error: message });
      }
    }
  );
}
