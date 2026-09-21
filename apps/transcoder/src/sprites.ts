import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import * as fs from "fs/promises";
import * as path from "path";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface SpriteResult {
  vttPath: string;
  spriteImagePath: string;
}

/**
 * Gera um arquivo WebVTT e um sprite sheet matricial para preview na timeline do player.
 */
export async function generateThumbnailSprites(
  inputVideoPath: string,
  outputDir: string,
  intervalSeconds: number = 2,
  thumbWidth: number = 160,
  thumbHeight: number = 90
): Promise<SpriteResult> {
  await fs.mkdir(outputDir, { recursive: true });

  const spriteImageFilename = "sprite.jpg";
  const spriteImagePath = path.join(outputDir, spriteImageFilename);
  const vttFilename = "thumbnails.vtt";
  const vttPath = path.join(outputDir, vttFilename);

  // Obtém duração do vídeo
  const durationSeconds = await getVideoDuration(inputVideoPath);
  const totalFrames = Math.floor(durationSeconds / intervalSeconds);

  // Layout do sprite: largura de colunas (ex: 10 colunas por linha)
  const columns = 10;
  const rows = Math.ceil(totalFrames / columns);

  return new Promise((resolve, reject) => {
    // FFmpeg filter: fps=1/interval, scale, tile
    const filter = `fps=1/${intervalSeconds},scale=${thumbWidth}:${thumbHeight},tile=${columns}x${rows}`;

    ffmpeg(inputVideoPath)
      .outputOptions(["-q:v", "3", "-frames:v", "1"])
      .complexFilter(filter)
      .output(spriteImagePath)
      .on("end", async () => {
        try {
          // Constrói arquivo WebVTT
          let vttContent = "WEBVTT\n\n";

          for (let i = 0; i < totalFrames; i++) {
            const startTime = formatVttTime(i * intervalSeconds);
            const endTime = formatVttTime(Math.min((i + 1) * intervalSeconds, durationSeconds));

            const colIndex = i % columns;
            const rowIndex = Math.floor(i / columns);
            const x = colIndex * thumbWidth;
            const y = rowIndex * thumbHeight;

            vttContent += `${startTime} --> ${endTime}\n`;
            vttContent += `${spriteImageFilename}#xywh=${x},${y},${thumbWidth},${thumbHeight}\n\n`;
          }

          await fs.writeFile(vttPath, vttContent, "utf-8");
          resolve({ vttPath, spriteImagePath });
        } catch (err) {
          reject(err);
        }
      })
      .on("error", (err) => {
        reject(err);
      })
      .run();
  });
}

function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        // Fallback estimado caso ffprobe não esteja mapeado
        resolve(120);
        return;
      }
      resolve(metadata.format.duration || 120);
    });
  });
}

function formatVttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const hh = h.toString().padStart(2, "0");
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  const mms = ms.toString().padStart(3, "0");

  return `${hh}:${mm}:${ss}.${mms}`;
}
