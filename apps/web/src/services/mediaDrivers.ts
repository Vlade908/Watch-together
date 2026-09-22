import { MediaSourceType } from "../types/sync";
import { calculateSparseFingerprint, FileFingerprintResult } from "./mediaFingerprint";

export interface IMediaSourceDriver {
  type: MediaSourceType;
  title: string;
  fingerprint?: string;
  directUrl?: string;
  isLocal: boolean;
  attach(videoElement: HTMLVideoElement, shakaPlayer?: any): Promise<void>;
  detach(): Promise<void>;
}

export const DEFAULT_DEMO_HLS_STREAM = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

/**
 * Driver 1: Catálogo de Demonstração (HLS multi-bitrate via Shaka Player)
 */
export class CatalogDemoDriver implements IMediaSourceDriver {
  public type: MediaSourceType = "CATALOG_DEMO";
  public title: string;
  public directUrl: string;
  public isLocal = false;

  constructor(title = "Interestelar: Além do Horizonte (Demo HLS)", directUrl = DEFAULT_DEMO_HLS_STREAM) {
    this.title = title;
    this.directUrl = directUrl;
  }

  async attach(videoElement: HTMLVideoElement, shakaPlayer?: any): Promise<void> {
    if (shakaPlayer) {
      await shakaPlayer.load(this.directUrl);
    } else {
      videoElement.src = this.directUrl;
      videoElement.load();
    }
  }

  async detach(): Promise<void> {
    // Não requer limpeza de recursos locais
  }
}

/**
 * Driver 2: Arquivo Local (Syncplay Web - BYOM)
 */
export class LocalFileDriver implements IMediaSourceDriver {
  public type: MediaSourceType = "LOCAL_FILE";
  public title: string;
  public fingerprint?: string;
  public isLocal = true;
  private file: File;
  private objectUrl: string | null = null;
  private fingerprintResult?: FileFingerprintResult;

  constructor(file: File) {
    this.file = file;
    this.title = file.name;
  }

  /**
   * Inicializa e extrai o fingerprint amostral do arquivo
   */
  async initialize(): Promise<FileFingerprintResult> {
    this.fingerprintResult = await calculateSparseFingerprint(this.file);
    this.fingerprint = this.fingerprintResult.fingerprint;
    return this.fingerprintResult;
  }

  async attach(videoElement: HTMLVideoElement, shakaPlayer?: any): Promise<void> {
    if (!this.objectUrl) {
      this.objectUrl = URL.createObjectURL(this.file);
    }

    // Se o Shaka Player estiver instanciado com streaming HLS anterior,
    // desanexa-o para permitir reprodução progressiva direta no HTMLVideoElement
    if (shakaPlayer) {
      try {
        await shakaPlayer.unload();
      } catch {
        // Ignora caso já esteja descarregado
      }
    }

    videoElement.src = this.objectUrl;
    videoElement.load();
  }

  async detach(): Promise<void> {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  getFingerprint(): string | undefined {
    return this.fingerprint;
  }

  getFile(): File {
    return this.file;
  }
}

/**
 * Validador defensivo de protocolo contra esquemas maliciosos (javascript:, data:, file:, etc.)
 */
export function isValidMediaUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Detecta se a URL é um manifesto adaptativo (HLS ou DASH)
 */
export function isAdaptiveStreamUrl(url: string): boolean {
  if (!isValidMediaUrl(url)) return false;
  const cleanUrl = url.toLowerCase().split("?")[0].split("#")[0];
  const fullUrl = url.toLowerCase();
  return (
    cleanUrl.endsWith(".m3u8") ||
    cleanUrl.endsWith(".mpd") ||
    fullUrl.includes(".m3u8") ||
    fullUrl.includes(".mpd") ||
    fullUrl.includes("/hls/") ||
    fullUrl.includes("/dash/")
  );
}

/**
 * Driver 3: URL Direta / Nuvem Pessoal (HTTPS MP4/WebM ou HLS/DASH)
 */
export class DirectUrlDriver implements IMediaSourceDriver {
  public type: MediaSourceType = "DIRECT_URL";
  public title: string;
  public directUrl: string;
  public isLocal = false;

  constructor(url: string, title?: string) {
    if (!isValidMediaUrl(url)) {
      throw new Error("Protocolo de mídia inválido. Apenas URLs com HTTP ou HTTPS são permitidas.");
    }
    this.directUrl = url.trim();
    this.title = title || url.split("/").pop()?.split("?")[0] || "Vídeo Direto";
  }

  async attach(videoElement: HTMLVideoElement, shakaPlayer?: any): Promise<void> {
    if (!isValidMediaUrl(this.directUrl)) {
      throw new Error("URL de mídia recusada por razões de segurança.");
    }

    const isAdaptive = isAdaptiveStreamUrl(this.directUrl);

    if (isAdaptive) {
      if (!shakaPlayer) {
        throw new Error(
          "A reprodução de manifestos HLS/DASH (.m3u8 / .mpd) requer Shaka Player via MSE para suporte em todos os navegadores."
        );
      }
      // Remove src nativo para evitar conflito com MediaSource Extensions
      videoElement.removeAttribute("src");
      videoElement.load();
      await shakaPlayer.load(this.directUrl);
    } else {
      // Mídia progressiva nativa (MP4, WebM)
      if (shakaPlayer) {
        try {
          await shakaPlayer.unload();
        } catch {
          // Ignora
        }
      }
      videoElement.src = this.directUrl;
      videoElement.load();
    }
  }

  async detach(): Promise<void> {
    // Não requer limpeza de recursos locais
  }
}
