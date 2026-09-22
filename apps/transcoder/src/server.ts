import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import mime from "mime-types";

export interface MediaServerOptions {
  port?: number;
  host?: string;
  mediaDir?: string;
}

/**
 * Resolve os tipos MIME específicos e recomendados para streaming HLS e WebVTT
 */
export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".m3u8":
      return "application/vnd.apple.mpegurl";
    case ".ts":
      return "video/mp2t";
    case ".vtt":
      return "text/vtt; charset=utf-8";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".mp4":
    case ".m4s":
      return "video/mp4";
    default:
      return (mime.lookup(filePath) as string) || "application/octet-stream";
  }
}

/**
 * Resolve o diretório raiz onde os pacotes de mídia HLS estão armazenados
 */
export function resolveMediaDir(configuredDir?: string): string {
  if (configuredDir) {
    const customPath = path.resolve(configuredDir);
    if (!fs.existsSync(customPath)) {
      fs.mkdirSync(customPath, { recursive: true });
    }
    return customPath;
  }

  // Tenta pastas padrão
  const outputDir = path.resolve("./output");
  const distMediaDir = path.resolve("./dist-media");

  if (fs.existsSync(outputDir)) return outputDir;
  if (fs.existsSync(distMediaDir)) return distMediaDir;

  // Cria output se nenhuma existir
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

/**
 * Cria o servidor HTTP de mídia com suporte a Byte-Range (HTTP 206), CORS aberto e streaming de alta performance
 */
export function createMediaServer(options: MediaServerOptions = {}): http.Server {
  const mediaDir = resolveMediaDir(options.mediaDir || process.env.MEDIA_DIR);

  const server = http.createServer((req, res) => {
    // 1. Cabeçalhos de CORS e Cache universais
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
    res.setHeader("Accept-Ranges", "bytes");

    // Resposta imediata para preflight OPTIONS
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Método não permitido");
      return;
    }

    // 2. Resolução segura de caminhos contra Path Traversal
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(parsedUrl.pathname);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Caminho inválido");
      return;
    }

    // Rota raiz informativa
    if (decodedPath === "/" || decodedPath === "") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const availableSlugs: string[] = [];
      try {
        const entries = fs.readdirSync(mediaDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && fs.existsSync(path.join(mediaDir, entry.name, "master.m3u8"))) {
            availableSlugs.push(entry.name);
          }
        }
      } catch {}

      res.end(
        JSON.stringify(
          {
            service: "Watch Together Local HLS Media Server",
            status: "ONLINE",
            mediaDirectory: mediaDir,
            availableStreams: availableSlugs.map((slug) => ({
              slug,
              masterPlaylist: `/${slug}/master.m3u8`,
            })),
          },
          null,
          2
        )
      );
      return;
    }

    const safeRelativePath = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, "");
    const filePath = path.join(mediaDir, safeRelativePath);

    // Garante que o arquivo requisitado está estritamente dentro da pasta de mídia permitida
    if (!filePath.startsWith(mediaDir)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Acesso negado");
      return;
    }

    // 3. Verificação de existência e leitura de estatísticas do arquivo
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        // Se for diretório, tenta servir o master.m3u8 contido nele
        const nestedMaster = path.join(filePath, "master.m3u8");
        if (fs.existsSync(nestedMaster)) {
          stat = fs.statSync(nestedMaster);
          return serveFile(req, res, nestedMaster, stat);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Diretório sem master.m3u8");
          return;
        }
      }
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Arquivo não encontrado");
      return;
    }

    serveFile(req, res, filePath, stat);
  });

  return server;
}

/**
 * Serve um arquivo com suporte a Byte-Range (HTTP 206 Partial Content) e cabeçalhos de streaming
 */
function serveFile(req: http.IncomingMessage, res: http.ServerResponse, filePath: string, stat: fs.Stats) {
  const contentType = getMimeType(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Cabeçalhos de cache otimizados
  if (ext === ".m3u8") {
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=30");
  } else if (ext === ".ts" || ext === ".m4s" || ext === ".mp4" || ext === ".vtt" || ext === ".jpg") {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "public, max-age=86400");
  }

  res.setHeader("Content-Type", contentType);

  const range = req.headers.range;

  // Se o cliente (Shaka Player / Navegador) solicitar um range específico
  if (range && range.startsWith("bytes=")) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

    // Validação dos limites do range
    if (isNaN(start) || isNaN(end) || start >= stat.size || end >= stat.size || start > end) {
      res.writeHead(416, {
        "Content-Range": `bytes */${stat.size}`,
        "Content-Type": "text/plain",
      });
      res.end("Range não satisfatório");
      return;
    }

    const chunkLength = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Content-Length": chunkLength,
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
    stream.on("error", (err) => {
      console.error(`[MediaServer] Erro no stream range de ${filePath}:`, err);
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
    return;
  }

  // Sem range: serve o arquivo integral
  res.writeHead(200, {
    "Content-Length": stat.size,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on("error", (err) => {
    console.error(`[MediaServer] Erro no stream de ${filePath}:`, err);
    if (!res.headersSent) {
      res.writeHead(500);
    }
    res.end();
  });
}

/**
 * Inicialização via execução direta (CLI)
 */
export async function startServer(options: MediaServerOptions = {}): Promise<http.Server> {
  const port = options.port || parseInt(process.env.PORT || "8085", 10);
  const host = options.host || "0.0.0.0";
  const mediaDir = resolveMediaDir(options.mediaDir);

  const server = createMediaServer({ ...options, mediaDir });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log("===============================================================");
      console.log("🍿 SERVIDOR DE MÍDIA LOCAL HLS (BYTE-RANGE & CORS)");
      console.log("===============================================================");
      console.log(`📡 Porta       : ${port}`);
      console.log(`📁 Diretório   : ${mediaDir}`);
      console.log(`🌐 URL Local   : http://localhost:${port}`);
      console.log("===============================================================");
      resolve(server);
    });

    server.on("error", (err) => {
      console.error("[MediaServer] Erro ao iniciar servidor HTTP:", err);
      reject(err);
    });
  });
}

// Executa se chamado diretamente
if (require.main === module) {
  startServer().catch((err) => {
    console.error("[MediaServer] Falha fatal:", err);
    process.exit(1);
  });
}
