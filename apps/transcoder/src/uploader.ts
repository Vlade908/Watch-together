import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import mime from "mime-types";
import dotenv from "dotenv";

dotenv.config();

export interface R2UploadConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrlPrefix: string;
}

export interface UploadProgress {
  currentFile: string;
  filesCompleted: number;
  totalFiles: number;
  bytesUploaded: number;
  totalBytes: number;
}

export interface UploadSummary {
  bucket: string;
  prefix: string;
  totalFiles: number;
  totalBytes: number;
  masterPlaylistUrl: string;
  spriteVttUrl?: string;
}

/**
 * Mapeia os cabeçalhos de Content-Type e Cache-Control específicos para streaming de mídia HLS
 */
export function getMediaHttpHeaders(filePath: string): { contentType: string; cacheControl: string } {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".m3u8":
      return {
        contentType: "application/vnd.apple.mpegurl",
        // Manifestos sofrem revalidação rápida
        cacheControl: "public, max-age=60, s-maxage=60, stale-while-revalidate=30",
      };
    case ".ts":
      return {
        contentType: "video/mp2t",
        // Chunks de mídia numerados são estáticos e imutáveis
        cacheControl: "public, max-age=31536000, immutable",
      };
    case ".m4s":
    case ".mp4":
      return {
        contentType: "video/mp4",
        cacheControl: "public, max-age=31536000, immutable",
      };
    case ".vtt":
      return {
        contentType: "text/vtt; charset=utf-8",
        cacheControl: "public, max-age=2592000, immutable",
      };
    case ".jpg":
    case ".jpeg":
      return {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=2592000, immutable",
      };
    case ".png":
      return {
        contentType: "image/png",
        cacheControl: "public, max-age=2592000, immutable",
      };
    case ".webp":
      return {
        contentType: "image/webp",
        cacheControl: "public, max-age=2592000, immutable",
      };
    default:
      return {
        contentType: (mime.lookup(filePath) as string) || "application/octet-stream",
        cacheControl: "public, max-age=86400",
      };
  }
}

/**
 * Cria o cliente S3 configurado para o endpoint do Cloudflare R2
 */
export function createR2Client(config: R2UploadConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * Lê recursivamente todos os arquivos de um diretório
 */
async function getAllFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await getAllFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Formata bytes em formato legível (KB, MB, GB)
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Valida a conexão com o bucket R2 antes de iniciar a pipeline
 */
export async function testR2Connection(config: R2UploadConfig): Promise<boolean> {
  const client = createR2Client(config);
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucketName }));
    return true;
  } catch (err) {
    console.error(`[R2 Uploader] Falha ao conectar ao bucket '${config.bucketName}':`, err);
    return false;
  }
}

/**
 * Envia todos os arquivos de um diretório local para o Cloudflare R2 preservando estrutura e cabeçalhos
 */
export async function uploadDirectoryToR2(
  localDir: string,
  remotePrefix: string,
  config: R2UploadConfig,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadSummary> {
  const client = createR2Client(config);
  const files = await getAllFiles(localDir);

  if (files.length === 0) {
    throw new Error(`[R2 Uploader] Nenhum arquivo encontrado no diretório: ${localDir}`);
  }

  // Calcula tamanho total dos arquivos
  let totalBytes = 0;
  for (const file of files) {
    const stat = await fs.stat(file);
    totalBytes += stat.size;
  }

  console.log(`[R2 Uploader] Iniciando upload de ${files.length} arquivos (${formatBytes(totalBytes)})...`);
  console.log(`[R2 Uploader] Bucket de destino: ${config.bucketName} / Prefixo: ${remotePrefix}`);

  let filesCompleted = 0;
  let bytesUploaded = 0;

  // Realiza upload concorrente moderado (concorrência 6)
  const CONCURRENCY = 6;
  const queue = [...files];

  async function worker() {
    while (queue.length > 0) {
      const filePath = queue.shift();
      if (!filePath) break;

      const relativePath = path.relative(localDir, filePath).replace(/\\/g, "/");
      const key = `${remotePrefix.replace(/\/+$/, "")}/${relativePath}`.replace(/^\/+/, "");
      const { contentType, cacheControl } = getMediaHttpHeaders(filePath);
      const stat = await fs.stat(filePath);
      const fileStream = fsSync.createReadStream(filePath);

      await client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          Body: fileStream,
          ContentType: contentType,
          CacheControl: cacheControl,
        })
      );

      filesCompleted++;
      bytesUploaded += stat.size;

      const progress: UploadProgress = {
        currentFile: path.basename(filePath),
        filesCompleted,
        totalFiles: files.length,
        bytesUploaded,
        totalBytes,
      };

      if (onProgress) {
        onProgress(progress);
      } else {
        const percent = ((bytesUploaded / totalBytes) * 100).toFixed(1);
        process.stdout.write(
          `\r[R2 Uploader] [${filesCompleted}/${files.length}] (${percent}%) - ${formatBytes(bytesUploaded)}/${formatBytes(totalBytes)} - ${path.basename(filePath)}`
        );
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker());
  await Promise.all(workers);

  process.stdout.write("\n");
  console.log(`[R2 Uploader] Upload concluído com sucesso! ${filesCompleted} arquivos enviados.`);

  const cleanPrefix = config.publicUrlPrefix.replace(/\/+$/, "");
  const masterPlaylistUrl = `${cleanPrefix}/${remotePrefix.replace(/^\/+|\/+$/g, "")}/master.m3u8`;
  const spriteVttUrl = `${cleanPrefix}/${remotePrefix.replace(/^\/+|\/+$/g, "")}/thumbnails.vtt`;

  return {
    bucket: config.bucketName,
    prefix: remotePrefix,
    totalFiles: filesCompleted,
    totalBytes,
    masterPlaylistUrl,
    spriteVttUrl,
  };
}
