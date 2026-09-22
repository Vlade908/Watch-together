import * as fs from "fs/promises";
import * as path from "path";
import dotenv from "dotenv";
import { transcodeToHls } from "./transcoder";
import { uploadDirectoryToR2, R2UploadConfig } from "./uploader";

dotenv.config();

interface CommandLineOptions {
  inputPath: string;
  slug: string;
  titleName: string;
  outputDir: string;
  skipUpload: boolean;
}

function parseArgs(): CommandLineOptions {
  const args = process.argv.slice(2);
  const options: Partial<CommandLineOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--input=")) {
      options.inputPath = arg.split("=")[1];
    } else if (arg === "--input" || arg === "-i") {
      options.inputPath = args[++i];
    } else if (arg.startsWith("--slug=")) {
      options.slug = arg.split("=")[1];
    } else if (arg === "--slug" || arg === "-s") {
      options.slug = args[++i];
    } else if (arg.startsWith("--title=")) {
      options.titleName = arg.split("=")[1];
    } else if (arg === "--title" || arg === "-t") {
      options.titleName = args[++i];
    } else if (arg.startsWith("--output=")) {
      options.outputDir = arg.split("=")[1];
    } else if (arg === "--output" || arg === "-o") {
      options.outputDir = args[++i];
    } else if (arg === "--skip-upload") {
      options.skipUpload = true;
    }
  }

  if (!options.inputPath) {
    console.error("❌ Erro: O parâmetro --input=<caminho-do-video> é obrigatório.");
    printUsage();
    process.exit(1);
  }

  const baseName = path.basename(options.inputPath, path.extname(options.inputPath));
  const defaultSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const slug = options.slug || defaultSlug;
  const titleName =
    options.titleName ||
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  const outputDir = options.outputDir || path.resolve(`./dist-media/${slug}`);

  return {
    inputPath: path.resolve(options.inputPath),
    slug,
    titleName,
    outputDir,
    skipUpload: Boolean(options.skipUpload),
  };
}

function printUsage() {
  console.log(`
Uso do Pipeline Unificado:
  npm run pipeline -- --input=<arquivo.mp4> [opções]

Opções:
  --input, -i       Caminho para o arquivo de vídeo bruto (MP4, MKV, etc.) [Obrigatório]
  --slug, -s        Slug identificador para a URL e catálogo (Ex: sintel-demo)
  --title, -t       Título amigável para exibição (Ex: "Sintel - Filme Curta")
  --output, -o      Diretório de saída dos arquivos transcodificados (Padrão: ./dist-media/<slug>)
  --skip-upload     Executa apenas a transcodificação local, pulando o upload para o R2

Exemplo:
  npm run pipeline -- --input=./videos/sintel.mp4 --slug=sintel-demo --title="Sintel 4K"
`);
}

function getR2Config(): R2UploadConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrlPrefix = process.env.R2_PUBLIC_URL_PREFIX;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrlPrefix) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrlPrefix,
  };
}

async function runPipeline() {
  const options = parseArgs();

  console.log("===============================================================");
  console.log("🎬 WATCH TOGETHER — PIPELINE UNIFICADA DE STREAMING HLS & R2");
  console.log("===============================================================");
  console.log(`📁 Arquivo de Entrada : ${options.inputPath}`);
  console.log(`🏷️  Slug do Título     : ${options.slug}`);
  console.log(`📺 Nome do Título     : ${options.titleName}`);
  console.log(`📦 Diretório Local    : ${options.outputDir}`);
  console.log(`☁️  Upload R2          : ${options.skipUpload ? "Desativado (--skip-upload)" : "Ativado"}`);
  console.log("---------------------------------------------------------------");

  // 1. Valida existência do arquivo de entrada
  try {
    await fs.access(options.inputPath);
  } catch {
    console.error(`❌ Erro: Arquivo de vídeo não encontrado em: ${options.inputPath}`);
    process.exit(1);
  }

  // 2. Valida variáveis do Cloudflare R2 se o upload não for ignorado
  const r2Config = getR2Config();
  if (!options.skipUpload && !r2Config) {
    console.error("❌ Erro: Variáveis de ambiente do Cloudflare R2 incompletas.");
    console.error("Verifique se as seguintes variáveis estão configuradas no .env:");
    console.error("  - R2_ACCOUNT_ID");
    console.error("  - R2_ACCESS_KEY_ID");
    console.error("  - R2_SECRET_ACCESS_KEY");
    console.error("  - R2_BUCKET_NAME");
    console.error("  - R2_PUBLIC_URL_PREFIX");
    console.error("\n💡 Dica: Para apenas gerar o pacote local sem subir, use a flag --skip-upload.");
    process.exit(1);
  }

  const overallStartTime = Date.now();

  // 3. Executa Transcodificação HLS e Miniaturas
  console.log("\n⚙️  Etapa 1/2: Transcodificando perfis ABR e gerando sprites...");
  const transcodeStart = Date.now();
  const transcodeResult = await transcodeToHls({
    inputPath: options.inputPath,
    outputDir: options.outputDir,
    generateSprites: true,
  });
  const transcodeElapsed = ((Date.now() - transcodeStart) / 1000).toFixed(1);
  console.log(`✅ Transcodificação concluída com sucesso em ${transcodeElapsed}s!`);

  // 4. Executa Upload para Cloudflare R2
  let publicMasterUrl = `file://${transcodeResult.masterPlaylistPath}`;
  let publicVttUrl = transcodeResult.sprites ? `file://${transcodeResult.sprites.vttPath}` : undefined;

  if (!options.skipUpload && r2Config) {
    console.log("\n☁️  Etapa 2/2: Enviando pacote HLS para o Cloudflare R2...");
    const uploadStart = Date.now();
    const uploadResult = await uploadDirectoryToR2(options.outputDir, options.slug, r2Config);
    const uploadElapsed = ((Date.now() - uploadStart) / 1000).toFixed(1);

    publicMasterUrl = uploadResult.masterPlaylistUrl;
    publicVttUrl = uploadResult.spriteVttUrl;
    console.log(`✅ Upload concluído em ${uploadElapsed}s!`);
  } else {
    console.log("\n⏭️  Etapa 2/2: Upload ignorado conforme solicitado.");
  }

  const totalElapsed = ((Date.now() - overallStartTime) / 1000).toFixed(1);

  // 5. Exibe Resumo e Snippet para Integração
  console.log("\n===============================================================");
  console.log("🎉 PIPELINE FINALIZADA COM SUCESSO!");
  console.log("===============================================================");
  console.log(`⏱️  Tempo Total       : ${totalElapsed}s`);
  console.log(`🔗 Master Playlist   : ${publicMasterUrl}`);
  if (publicVttUrl) {
    console.log(`🖼️  Timeline Sprites : ${publicVttUrl}`);
  }

  console.log("\n📋 Snippet para incluir no 'apps/web/src/data/mockCatalog.ts':");
  console.log("---------------------------------------------------------------");
  const catalogSnippet = {
    id: `custom-${options.slug}`,
    slug: options.slug,
    name: options.titleName,
    synopsis: "Transmissão otimizada com streaming HLS multi-bitrate via Cloudflare R2.",
    releaseYear: new Date().getFullYear(),
    ageRating: "L",
    durationMinutes: 120,
    type: "MOVIE",
    bannerUrl: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2070&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
    previewVideoUrl: publicMasterUrl,
    matchPercentage: 99,
    genres: ["Streaming Cloudflare R2", "HLS Multi-bitrate", "ABR"],
    cast: ["Watch Together Media Engine"],
    director: "Watch Together Pipeline",
    moods: ["Alta Fidelidade", "Zero Egress"],
  };
  console.log(JSON.stringify(catalogSnippet, null, 2));

  console.log("\n📋 Snippet para registro no banco de dados (Prisma MediaAsset):");
  console.log("---------------------------------------------------------------");
  const prismaSnippet = {
    masterPlaylistUrl: publicMasterUrl,
    spriteVttUrl: publicVttUrl || null,
    spriteImageUrl: publicVttUrl ? publicVttUrl.replace("thumbnails.vtt", "sprite.jpg") : null,
    hlsResolutions: transcodeResult.renditions.map((r) => ({
      resolution: r.name,
      bandwidth: r.bandwidth,
      url: `${publicMasterUrl.replace("master.m3u8", "")}${r.name}/${r.name}.m3u8`,
    })),
    durationSeconds: 7200,
    status: "READY",
  };
  console.log(JSON.stringify(prismaSnippet, null, 2));
  console.log("===============================================================\n");
}

runPipeline().catch((err) => {
  console.error("❌ Falha fatal na execução do pipeline:", err);
  process.exit(1);
});
