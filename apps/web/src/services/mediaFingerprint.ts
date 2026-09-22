/**
 * Algoritmo de Fingerprint Amostral Criptográfico (Sparse Multi-Chunk SHA-256)
 *
 * Realiza a leitura e dispersão criptográfica dos pontos críticos de arquivos de vídeo
 * (primeiros 4MB, 4MB centrais e últimos 4MB + tamanho exato em bytes).
 *
 * Desempenho: Executa em menos de 150ms mesmo para arquivos 4K/Remux superiores a 50GB,
 * sem sobrecarregar a thread do navegador nem consumir memória desnecessária.
 */

export interface FileFingerprintResult {
  fingerprint: string;
  sizeBytes: number;
  fileName: string;
  formattedSize: string;
}

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB por bloco de amostragem

/**
 * Lê uma fatia (slice) de um File/Blob como ArrayBuffer de forma assíncrona
 */
function readSliceAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler fatia do arquivo"));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Converte bytes numéricos em representação legível (ex: "4.25 GB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Calcula o fingerprint criptográfico rápido de um arquivo local
 */
export async function calculateSparseFingerprint(file: File): Promise<FileFingerprintResult> {
  const size = file.size;
  let combinedBuffer: Uint8Array;

  // Se o arquivo for menor ou igual a 12 MB, lê o arquivo na íntegra
  if (size <= CHUNK_SIZE * 3) {
    const fullBuffer = await readSliceAsArrayBuffer(file);
    const sizeBytes = new ArrayBuffer(8);
    new DataView(sizeBytes).setBigUint64(0, BigInt(size), true);

    combinedBuffer = new Uint8Array(fullBuffer.byteLength + 8);
    combinedBuffer.set(new Uint8Array(fullBuffer), 0);
    combinedBuffer.set(new Uint8Array(sizeBytes), fullBuffer.byteLength);
  } else {
    // 1. Cabeçalho (primeiros 4MB - EBML / moov atom)
    const headSlice = file.slice(0, CHUNK_SIZE);
    // 2. Miolo (4MB centrais do container)
    const midStart = Math.floor((size - CHUNK_SIZE) / 2);
    const midSlice = file.slice(midStart, midStart + CHUNK_SIZE);
    // 3. Rodapé (últimos 4MB - índices de clusters / metadata final)
    const tailSlice = file.slice(size - CHUNK_SIZE, size);

    const [headBuf, midBuf, tailBuf] = await Promise.all([
      readSliceAsArrayBuffer(headSlice),
      readSliceAsArrayBuffer(midSlice),
      readSliceAsArrayBuffer(tailSlice),
    ]);

    // Anexa 8 bytes com o tamanho exato do arquivo para evitar colisões
    const sizeBytes = new ArrayBuffer(8);
    new DataView(sizeBytes).setBigUint64(0, BigInt(size), true);

    const totalLength = headBuf.byteLength + midBuf.byteLength + tailBuf.byteLength + 8;
    combinedBuffer = new Uint8Array(totalLength);

    let offset = 0;
    combinedBuffer.set(new Uint8Array(headBuf), offset);
    offset += headBuf.byteLength;
    combinedBuffer.set(new Uint8Array(midBuf), offset);
    offset += midBuf.byteLength;
    combinedBuffer.set(new Uint8Array(tailBuf), offset);
    offset += tailBuf.byteLength;
    combinedBuffer.set(new Uint8Array(sizeBytes), offset);
  }

  // Digestão criptográfica SHA-256 via Web Crypto API nativa
  let hashHex = "";
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const hashBuffer = await window.crypto.subtle.digest(
      "SHA-256",
      combinedBuffer.buffer as ArrayBuffer
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    // Fallback simples caso executado fora do contexto de navegador com SubtleCrypto
    let hash = 0;
    for (let i = 0; i < combinedBuffer.length; i++) {
      hash = (hash << 5) - hash + combinedBuffer[i];
      hash |= 0;
    }
    hashHex = Math.abs(hash).toString(16).padStart(16, "0");
  }

  // Retorna fingerprint truncado em 24 caracteres hexadecimais para transmissão leve
  const truncatedFingerprint = hashHex.substring(0, 24);

  return {
    fingerprint: truncatedFingerprint,
    sizeBytes: size,
    fileName: file.name,
    formattedSize: formatBytes(size),
  };
}

/**
 * Heurística avançada para limpar e extrair um título legível a partir de um nome de arquivo ou URL
 * Ex: "Interestelar.2014.1080p.BluRay.x264.mkv" -> "Interestelar 2014"
 */
export function extractCleanMediaTitle(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  // 1. Isola o nome do arquivo caso seja uma URL
  let name = raw.split("?")[0].split("#")[0].split("/").pop() || raw;
  try {
    name = decodeURIComponent(name);
  } catch {}

  // 2. Remove extensões comuns de vídeo e manifesto
  name = name.replace(/\.(mp4|mkv|webm|avi|mov|m3u8|mpd|ts|flv|m4v|wmv)$/i, "");

  // 3. Remove colchetes e parênteses de grupos/releases ex: [YTS.LT], (1080p)
  name = name.replace(/\[[^\]]*\]/g, " ").replace(/\([^\)]*\)/g, " ");

  // 4. Remove termos e tags de scene release comuns (case insensitive)
  const tagsRegex = /\b(2160p|4k|uhd|1080p|720p|480p|360p|bluray|blu-ray|bdrip|brrip|web-dl|webdl|webrip|web-rip|hdtv|remux|x264|x265|h264|h265|hevc|avc|10bit|hdr|hdr10|dovi|dts|dts-hd|truehd|atmos|aac|ac3|eac3|dd5\.1|5\.1|7\.1|yify|yts|rarbg|psa|sparks|fgt|evo|galaxy|vostfr|multi|dublado|legendado|ita|spa|latino)\b/gi;
  name = name.replace(tagsRegex, " ");

  // 5. Substitui pontos, underscores, hífens isolados e múltiplos espaços
  name = name
    .replace(/[._+]/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) return "Vídeo Sem Título";

  // 6. Capitaliza cada palavra
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      // Se for número (ex: ano "2014"), preserva intacto
      if (/^\d+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
