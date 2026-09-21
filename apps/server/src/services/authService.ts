import bcrypt from "bcryptjs";
import { prisma } from "@watch-together/database";

export class AuthService {
  /**
   * Registra um novo usuário no banco com senha criptografada e perfil padrão
   */
  public static async register(data: {
    name: string;
    email: string;
    password: string;
    avatarUrl?: string;
  }) {
    const normalizedEmail = data.email.toLowerCase().trim();

    // 1. Verifica se o email já está cadastrado
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      const error: any = new Error("Este endereço de e-mail já está em uso.");
      error.statusCode = 409;
      throw error;
    }

    // 2. Hash da senha com salt 10
    const passwordHash = await bcrypt.hash(data.password, 10);

    // 3. Cria usuário com perfil padrão
    const user = await prisma.user.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        passwordHash,
        avatarUrl: data.avatarUrl || null,
        profiles: {
          create: {
            name: data.name.trim(),
            avatarUrl: data.avatarUrl || null,
            isKid: false,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Valida credenciais e retorna os dados do usuário autenticado
   */
  public static async login(data: { email: string; password: string }) {
    const normalizedEmail = data.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      const error: any = new Error("Credenciais inválidas.");
      error.statusCode = 401;
      throw error;
    }

    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) {
      const error: any = new Error("Credenciais inválidas.");
      error.statusCode = 401;
      throw error;
    }

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Busca os dados públicos e perfis do usuário conectado
   */
  public static async getUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        profiles: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            isKid: true,
          },
        },
      },
    });

    if (!user) {
      const error: any = new Error("Usuário não encontrado.");
      error.statusCode = 404;
      throw error;
    }

    return user;
  }
}
