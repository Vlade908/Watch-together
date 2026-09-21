import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import * as fs from "fs/promises";
import * as path from "path";
import { generateThumbnailSprites, SpriteResult } from "./sprites";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface RenditionConfig {
  name: string;
  width: number;
  height: number;
  videoBitrate: string; // Ex: "4500k"
  audioBitrate: string; // Ex: "192k"
  bandwidth: number;    // Ex: 4800000 (bits por segundo para o manifesto)
}

export const DEFAULT_HLS_LADDER: RenditionConfig[] = [
  { name: "1080p", width: 1920, height: 1080, videoBitrate: "4500k", audioBitrate: "192k", bandwidth: 4800000 },
  { name: "720p",  width: 1280, height: 720,  videoBitrate: "2500k", audioBitrate: "128k", bandwidth: 2700000 },
  { name: "480p",  width: 854,  height: 480,  videoBitrate: "1200k", audioBitrate: "96k",  bandwidth: 1350000 },
  { name: "360p",  width: 640,  height: 360,  videoBitrate: "600k",  audioBitrate: "64k",  bandwidth: 700000 },
];

export interface TranscodeJobOptions {
  inputPath: string;
  outputDir: string;
  renditions?: RenditionConfig[];
  segmentDuration?: number; // Segundos (padrão: 4s)
  generateSprites?: boolean;
}

export interface TranscodeJobResult {
  masterPlaylistPath: string;
  renditions: { name: string; playlistPath: string; resolution: string; bandwidth: number }[];
  sprites?: SpriteResult;
}

/**
 * Orquestra a transcodificação de um vídeo MP4 em um pacote HLS VOD multi-bitrate.
 */
export async function transcodeToHls(options: TranscodeJobOptions): Promise<TranscodeJobResult> {
  const {
    inputPath,
    outputDir,
    renditions = DEFAULT_HLS_LADDER,
    segmentDuration = 4,
    generateSprites = true,
  } = options;

  await fs.mkdir(outputDir, { recursive: true });

  const renditionsResults: TranscodeJobResult["renditions"] = [];

  // 1. Transcodifica cada resolução individual
  for (const rendition of renditions) {
    const renditionDir = path.join(outputDir, rendition.name);
    await fs.mkdir(renditionDir, { recursive: true });

    const playlistFilename = `${rendition.name}.m3u8`;
    const playlistPath = path.join(renditionDir, playlistFilename);
    const segmentPattern = path.join(renditionDir, `${rendition.name}_%04d.ts`);

    console.log(`[Transcoder] Processando perfil ${rendition.name} (${rendition.width}x${rendition.height} @ ${rendition.videoBitrate})...`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-profile:v", "main",
          "-crf", "20",
          "-sc_threshold", "0",
          "-g", "96", // GOP size correspondente a ~4s em 24fps
          "-keyint_min", "96",
          "-b:v", rendition.videoBitrate,
          "-maxrate", rendition.videoBitrate,
          "-bufsize", `${parseInt(rendition.videoBitrate) * 2}k`,
          "-c:a", "aac",
          "-b:a", rendition.audioBitrate,
          "-ac", "2",
          "-ar", "48000",
          "-f", "hls",
          "-hls_time", segmentDuration.toString(),
          "-hls_playlist_type", "vod",
          "-hls_flags", "independent_segments",
          "-hls_segment_type", "mpegts",
          "-hls_segment_filename", segmentPattern,
        ])
        .size(`${rendition.width}x${rendition.height}`)
        .output(playlistPath)
        .on("end", () => {
          console.log(`[Transcoder] Perfil ${rendition.name} concluído com sucesso!`);
          resolve();
        })
        .on("error", (err) => {
          console.error(`[Transcoder] Erro ao processar perfil ${rendition.name}:`, err);
          reject(err);
        })
        .run();
    });

    renditionsResults.push({
      name: rendition.name,
      playlistPath,
      resolution: `${rendition.width}x${rendition.height}`,
      bandwidth: rendition.bandwidth,
    });
  }

  // 2. Cria o Master Playlist (master.m3u8) agregador
  const masterPlaylistPath = path.join(outputDir, "master.m3u8");
  let masterContent = "#EXTM3U\n#EXT-X-VERSION:3\n\n";

  for (const rendition of renditions) {
    masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${rendition.width}x${rendition.height},NAME="${rendition.name}"\n`;
    masterContent += `${rendition.name}/${rendition.name}.m3u8\n\n`;
  }

  await fs.writeFile(masterPlaylistPath, masterContent, "utf-8");
  console.log(`[Transcoder] Master playlist criada em: ${masterPlaylistPath}`);

  // 3. Gera Sprites de Thumbnail se solicitado
  let spritesResult: SpriteResult | undefined;
  if (generateSprites) {
    console.log("[Transcoder] Gerando sprites de miniaturas para busca na timeline...");
    try {
      spritesResult = await generateThumbnailSprites(inputPath, outputDir);
      console.log(`[Transcoder] Sprites gerados em: ${spritesResult.vttPath}`);
    } catch (err) {
      console.warn("[Transcoder] Aviso: Não foi possível gerar os sprites:", err);
    }
  }

  return {
    masterPlaylistPath,
    renditions: renditionsResults,
    sprites: spritesResult,
  };
}

export * from "./sprites";
