import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Readable } from "stream";

function validateProxyUrl(targetUrl?: string): { url: URL } | { error: string; status: number } {
  if (!targetUrl || typeof targetUrl !== "string") {
    return { error: "URL inválida ou ausente. O parâmetro 'url' é obrigatório.", status: 400 };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl.trim());
  } catch {
    return { error: "URL malformatada.", status: 400 };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { error: "Apenas protocolos HTTP e HTTPS são suportados.", status: 400 };
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
    return {
      error: "Acesso a endereços locais ou redes internas é proibido por segurança.",
      status: 403,
    };
  }

  return { url: parsedUrl };
}

export async function proxyRoutes(fastify: FastifyInstance) {
  // 1. Endpoint para Manifestos HLS (.m3u8) com Reescrita Transparente de URLs
  fastify.get<{ Querystring: { url?: string } }>(
    "/manifest",
    async (req: FastifyRequest<{ Querystring: { url?: string } }>, reply: FastifyReply) => {
      const validation = validateProxyUrl(req.query.url);
      if ("error" in validation) {
        return reply.status(validation.status).send({ error: validation.error });
      }
      const targetUrl = validation.url.toString();

      try {
        const response = await fetch(targetUrl, {
          signal: AbortSignal.timeout(8000),
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "*/*",
            Referer: `${validation.url.origin}/`,
            Origin: validation.url.origin,
          },
        });

        if (!response.ok) {
          return reply.status(response.status).send({
            error: "UPSTREAM_UNAVAILABLE",
            status: response.status,
            message: `Servidor de origem retornou HTTP ${response.status}`,
          });
        }

        const content = await response.text();

        // Se for playlist HLS (.m3u8), reescreve sub-playlists e segmentos para passarem pelo proxy
        if (content.includes("#EXTM3U")) {
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
          const lines = content.split("\n");

          const rewrittenLines = lines.map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            // Reescreve URIs dentro de diretivas como #EXT-X-KEY ou #EXT-X-MAP
            if (trimmed.startsWith("#")) {
              return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                try {
                  const absoluteUri = new URL(uri, baseUrl).toString();
                  return `URI="/api/proxy/stream?url=${encodeURIComponent(absoluteUri)}"`;
                } catch {
                  return match;
                }
              });
            }

            // Linha de segmento ou sub-playlist
            try {
              const absoluteUri = new URL(trimmed, baseUrl).toString();
              if (absoluteUri.includes(".m3u8")) {
                return `/api/proxy/manifest?url=${encodeURIComponent(absoluteUri)}`;
              }
              // Segmentos de mídia (.ts, .m4s, .mp4, etc.)
              return `/api/proxy/stream?url=${encodeURIComponent(absoluteUri)}`;
            } catch {
              return line;
            }
          });

          reply.header("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
          reply.header("Access-Control-Allow-Origin", "*");
          reply.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
          reply.header("Cache-Control", "public, max-age=10");
          return reply.send(rewrittenLines.join("\n"));
        }

        // Se não for playlist HLS (ex: vídeo progressivo enviado para /manifest), redireciona para stream
        return reply.redirect(`/api/proxy/stream?url=${encodeURIComponent(targetUrl)}`, 302);
      } catch (err: any) {
        fastify.log.warn(`[Proxy Manifest Error] Falha ao contatar upstream ${targetUrl}: ${err.message}`);
        const status = err.name === "TimeoutError" ? 504 : 502;
        return reply.status(status).send({
          error: "UPSTREAM_UNAVAILABLE",
          status,
          details: err.name === "TimeoutError" ? "Timeout de 8s ao conectar à origem." : err.message,
        });
      }
    }
  );

  // 2. Endpoint para Segmentos de Mídia (.ts, .m4s, .mp4) com Streaming Direto e Suporte a Range
  fastify.get<{ Querystring: { url?: string } }>(
    "/stream",
    async (req: FastifyRequest<{ Querystring: { url?: string } }>, reply: FastifyReply) => {
      const validation = validateProxyUrl(req.query.url);
      if ("error" in validation) {
        return reply.status(validation.status).send({ error: validation.error });
      }
      const targetUrl = validation.url.toString();

      const fetchHeaders: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        Referer: `${validation.url.origin}/`,
        Origin: validation.url.origin,
      };

      if (req.headers.range) {
        fetchHeaders.Range = req.headers.range;
      }

      try {
        const response = await fetch(targetUrl, {
          signal: AbortSignal.timeout(8000),
          headers: fetchHeaders,
        });

        if (!response.ok && response.status !== 206) {
          return reply.status(response.status).send({
            error: "UPSTREAM_UNAVAILABLE",
            status: response.status,
            message: `Servidor de origem retornou HTTP ${response.status}`,
          });
        }

        if (!response.body) {
          return reply.status(502).send({
            error: "UPSTREAM_UNAVAILABLE",
            status: 502,
            message: "Corpo de resposta vazio do servidor de origem.",
          });
        }

        const isTs = targetUrl.toLowerCase().includes(".ts");
        const contentType =
          response.headers.get("content-type") ||
          (isTs ? "video/MP2T" : "video/mp4");

        reply.status(response.status);
        reply.header("Content-Type", contentType);
        reply.header("Access-Control-Allow-Origin", "*");
        reply.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        reply.header("Access-Control-Allow-Headers", "Range, Accept, Origin, Content-Type");
        reply.header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
        reply.header("Cache-Control", "public, max-age=3600");

        const contentLength = response.headers.get("content-length");
        if (contentLength) {
          reply.header("Content-Length", contentLength);
        }

        const contentRange = response.headers.get("content-range");
        if (contentRange) {
          reply.header("Content-Range", contentRange);
        }

        const acceptRanges = response.headers.get("accept-ranges");
        if (acceptRanges) {
          reply.header("Accept-Ranges", acceptRanges);
        }

        return reply.send(Readable.fromWeb(response.body as any));
      } catch (err: any) {
        fastify.log.warn(`[Proxy Stream Error] Falha ao transmitir chunk de ${targetUrl}: ${err.message}`);
        const status = err.name === "TimeoutError" ? 504 : 502;
        return reply.status(status).send({
          error: "UPSTREAM_UNAVAILABLE",
          status,
          details: err.name === "TimeoutError" ? "Timeout de 8s no streaming do chunk." : err.message,
        });
      }
    }
  );

  // 3. Suporte a Preflight CORS (OPTIONS)
  fastify.options("/manifest", async (_req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Range, Accept, Origin, Content-Type");
    return reply.status(204).send();
  });

  fastify.options("/stream", async (_req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Range, Accept, Origin, Content-Type");
    return reply.status(204).send();
  });
}
