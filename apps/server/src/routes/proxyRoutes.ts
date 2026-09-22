import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export async function proxyRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { url?: string } }>(
    "/manifest",
    async (req: FastifyRequest<{ Querystring: { url?: string } }>, reply: FastifyReply) => {
      const targetUrl = req.query.url;

      if (!targetUrl || typeof targetUrl !== "string") {
        return reply.status(400).send({
          error: "URL inválida ou ausente. O parâmetro 'url' é obrigatório.",
        });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        return reply.status(400).send({ error: "URL malformatada." });
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return reply.status(400).send({ error: "Apenas protocolos HTTP e HTTPS são suportados." });
      }

      // Prevenção de SSRF (Server-Side Request Forgery)
      const hostname = parsedUrl.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname === "169.254.169.254" ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      ) {
        return reply.status(403).send({
          error: "Acesso a endereços locais ou redes internas é proibido por segurança.",
        });
      }

      try {
        const response = await fetch(targetUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "*/*",
          },
        });

        if (!response.ok) {
          return reply.status(response.status).send({
            error: `Falha ao obter manifesto do servidor de origem (HTTP ${response.status})`,
          });
        }

        const contentType = response.headers.get("content-type") || "application/vnd.apple.mpegurl";
        const content = await response.text();

        // Se for playlist HLS (.m3u8), reescreve caminhos relativos para URLs absolutas
        if (content.includes("#EXTM3U")) {
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
          const lines = content.split("\n");

          const rewrittenLines = lines.map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) {
              // Reescreve URIs dentro de diretivas como #EXT-X-KEY ou #EXT-X-MAP se forem relativas
              return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                try {
                  const abs = new URL(uri, baseUrl).toString();
                  return `URI="${abs}"`;
                } catch {
                  return match;
                }
              });
            }

            try {
              const absoluteUri = new URL(trimmed, baseUrl).toString();
              // Se a linha apontar para outro manifesto (.m3u8), encadeia via proxy
              if (absoluteUri.includes(".m3u8")) {
                return `/api/proxy/manifest?url=${encodeURIComponent(absoluteUri)}`;
              }
              return absoluteUri;
            } catch {
              return line;
            }
          });

          reply.header("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
          reply.header("Access-Control-Allow-Origin", "*");
          return reply.send(rewrittenLines.join("\n"));
        }

        reply.header("Content-Type", contentType);
        reply.header("Access-Control-Allow-Origin", "*");
        return reply.send(content);
      } catch (err: any) {
        fastify.log.error(err, "[Proxy Manifest Error]");
        return reply.status(502).send({
          error: "Não foi possível conectar ao servidor de origem do vídeo.",
          details: err.message,
        });
      }
    }
  );
}
