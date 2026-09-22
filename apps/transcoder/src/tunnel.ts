import * as fs from "fs";
import * as path from "path";
import { startTunnel } from "untun";
import { startServer, resolveMediaDir } from "./server";

interface AvailableMovie {
  slug: string;
  name: string;
  masterUrl: string;
  vttUrl?: string;
}

async function runTunnel() {
  const port = parseInt(process.env.PORT || "8085", 10);
  const mediaDir = resolveMediaDir(process.env.MEDIA_DIR);

  console.log("Iniciando servidor de streaming local HLS...");
  const server = await startServer({ port, mediaDir });

  console.log("\nConectando ao Cloudflare Quick Tunnel (Egress Gratuito & Zero Configuração)...");

  let tunnel: any;
  try {
    tunnel = await startTunnel({
      url: `http://localhost:${port}`,
      port,
      acceptCloudflareNotice: true,
    });
  } catch (err) {
    console.error("❌ Falha ao estabelecer o Cloudflare Quick Tunnel:", err);
    server.close();
    process.exit(1);
  }

  if (!tunnel) {
    console.error("❌ O túnel não pôde ser iniciado.");
    server.close();
    process.exit(1);
  }

  const publicBaseUrl = (await tunnel.getURL()).replace(/\/+$/, "");

  // Varre o diretório de mídia para encontrar filmes e episódios prontos
  const availableMovies: AvailableMovie[] = [];
  try {
    const entries = fs.readdirSync(mediaDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const masterPath = path.join(mediaDir, entry.name, "master.m3u8");
        const vttPath = path.join(mediaDir, entry.name, "thumbnails.vtt");

        if (fs.existsSync(masterPath)) {
          const formattedName = entry.name
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

          availableMovies.push({
            slug: entry.name,
            name: formattedName,
            masterUrl: `${publicBaseUrl}/${entry.name}/master.m3u8`,
            vttUrl: fs.existsSync(vttPath) ? `${publicBaseUrl}/${entry.name}/thumbnails.vtt` : undefined,
          });
        }
      }
    }
  } catch (err) {
    console.warn("Aviso ao ler pastas de mídia:", err);
  }

  console.log("\n===============================================================");
  console.log("🍿 STREAMING LOCAL ATIVO (CLOUDFLARE QUICK TUNNEL)");
  console.log("===============================================================");
  console.log(`🌐 URL Base Pública : ${publicBaseUrl}`);
  console.log(`📁 Diretório Local  : ${mediaDir}`);
  console.log(`📡 Porta Local      : ${port}`);
  console.log("---------------------------------------------------------------");

  if (availableMovies.length === 0) {
    console.log("ℹ️  Nenhum título transcodificado encontrado no momento.");
    console.log(`   Coloque um vídeo e execute: npm run pipeline -- --input=./video.mp4 --slug=meu-filme --skip-upload`);
    console.log(`   O vídeo será salvo em '${mediaDir}/meu-filme' e ficará disponível automaticamente.`);
  } else {
    console.log(`🎬 Títulos Prontos para Compartilhar na Sala (${availableMovies.length} encontrados):`);
    for (const movie of availableMovies) {
      console.log(`\n  🎥 [${movie.name}]`);
      console.log(`     🔗 Stream HLS: ${movie.masterUrl}`);
      if (movie.vttUrl) {
        console.log(`     🖼️  Preview VTT: ${movie.vttUrl}`);
      }
      console.log(`     👉 Para assistir em grupo:`);
      console.log(`        Abra a sala e insira a URL acima no campo "URL Direta" ou acesse:`);
      console.log(`        http://localhost:3000/watch/direto?mode=room&room=sala-${movie.slug}&url=${encodeURIComponent(movie.masterUrl)}`);
    }
  }

  console.log("===============================================================");
  console.log("💡 O túnel permanecerá ativo enquanto este processo estiver rodando.");
  console.log("   Pressione CTRL+C a qualquer momento para encerrar.");
  console.log("===============================================================\n");

  const cleanup = async () => {
    console.log("\nEncerrando túnel e servidor de mídia...");
    try {
      if (tunnel?.close) await tunnel.close();
      server.close();
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

runTunnel().catch((err) => {
  console.error("❌ Erro fatal no runner do túnel:", err);
  process.exit(1);
});
