import { RoomState } from "../types/sync";

export interface ClockSample {
  offset: number; // ms (ServerTime - ClientTime)
  rtt: number;    // ms (Round Trip Time)
  timestamp: number;
}

export class ClockSyncEngine {
  private samples: ClockSample[] = [];
  private maxSamples = 10;
  private currentOffset = 0;

  /**
   * Processa resposta de clock_pong aplicando o algoritmo de Cristian
   */
  public processClockPong(clientSendTime: number, serverReceiveTime: number, serverSendTime: number) {
    const now = Date.now();
    const rtt = Math.max(0, now - clientSendTime);
    
    // Algoritmo de Cristian: offset = ((serverReceive + serverSend) / 2) - ((clientSend + now) / 2)
    const serverMidpoint = (serverReceiveTime + serverSendTime) / 2;
    const clientMidpoint = (clientSendTime + now) / 2;
    const offset = serverMidpoint - clientMidpoint;

    this.samples.push({ offset, rtt, timestamp: now });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    // Filtra amostras: descarta amostras com RTT acima da mediana para rejeitar ruído/jitter de rede
    const sortedByRtt = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    const bestSamples = sortedByRtt.slice(0, Math.ceil(this.samples.length * 0.6));

    // Média ponderada pelo inverso do RTT das melhores amostras
    if (bestSamples.length > 0) {
      const avgOffset =
        bestSamples.reduce((acc, s) => acc + s.offset, 0) / bestSamples.length;
      this.currentOffset = Math.round(avgOffset);
    }
  }

  /**
   * Retorna o timestamp de parede estimado do servidor (ms)
   */
  public getAuthoritativeServerTime(): number {
    return Date.now() + this.currentOffset;
  }

  /**
   * Retorna o offset atual de relógio em milissegundos
   */
  public getClockOffset(): number {
    return this.currentOffset;
  }

  /**
   * Calcula o tempo exato de reprodução da mídia autoritativo neste milissegundo
   */
  public calculateAuthoritativeMediaTime(state: RoomState): number {
    if (state.status === "PAUSED") {
      return state.referenceMediaTime;
    }

    const currentServerTime = this.getAuthoritativeServerTime();
    const elapsedSeconds = (currentServerTime - state.referenceWallTime) / 1000;
    return Math.max(0, state.referenceMediaTime + elapsedSeconds * state.playbackSpeed);
  }
}

export interface DriftEvaluationResult {
  zone: 1 | 2 | 3;
  driftMs: number;
  appliedSpeed: number;
  action: "TOLERANCE" | "SPEED_UP" | "SLOW_DOWN" | "HARD_SEEK";
}

export class DriftController {
  /**
   * Avalia a discrepância entre o vídeo local e a linha do tempo autoritativa da sala
   * ZONA 1 (< 250ms): Tolerância. Mantém 1.0x.
   * ZONA 2 (250ms a 1500ms): Micro-ajuste suave (1.05x ou 0.95x) sem glitch de áudio.
   * ZONA 3 (>= 1500ms): Hard seek para o ponto exato da sala.
   */
  public static evaluate(
    videoElement: HTMLVideoElement,
    authoritativeMediaTime: number,
    isRoomPlaying: boolean
  ): DriftEvaluationResult {
    const currentVideoTime = videoElement.currentTime;
    const driftSeconds = currentVideoTime - authoritativeMediaTime;
    const driftMs = Math.round(driftSeconds * 1000);
    const absDriftMs = Math.abs(driftMs);

    // Se a sala estiver pausada, o vídeo deve pausar e alinhar a posição
    if (!isRoomPlaying) {
      if (absDriftMs > 150) {
        videoElement.currentTime = authoritativeMediaTime;
      }
      if (!videoElement.paused) {
        videoElement.pause();
      }
      videoElement.playbackRate = 1.0;
      return {
        zone: 1,
        driftMs,
        appliedSpeed: 1.0,
        action: "TOLERANCE",
      };
    }

    // Se a sala está reproduzindo mas o vídeo local está pausado:
    if (videoElement.paused) {
      videoElement.currentTime = authoritativeMediaTime;
      videoElement.play().catch(() => {});
    }

    // ZONA 1: < 250ms (Tolerância perfeita de sincronização)
    if (absDriftMs < 250) {
      if (videoElement.playbackRate !== 1.0) {
        videoElement.playbackRate = 1.0;
      }
      return {
        zone: 1,
        driftMs,
        appliedSpeed: 1.0,
        action: "TOLERANCE",
      };
    }

    // ZONA 2: 250ms a 1500ms (Ajuste Suave de Velocidade)
    if (absDriftMs < 1500) {
      if (driftMs < 0) {
        // Cliente está ATRASADO em relação à sala: acelera suavemente para alcançar
        const speed = 1.05;
        videoElement.playbackRate = speed;
        return {
          zone: 2,
          driftMs,
          appliedSpeed: speed,
          action: "SPEED_UP",
        };
      } else {
        // Cliente está ADIANTADO em relação à sala: desacelera suavemente para esperar o grupo
        const speed = 0.95;
        videoElement.playbackRate = speed;
        return {
          zone: 2,
          driftMs,
          appliedSpeed: speed,
          action: "SLOW_DOWN",
        };
      }
    }

    // ZONA 3: >= 1500ms (Hard Seek Autoritativo)
    videoElement.currentTime = authoritativeMediaTime;
    videoElement.playbackRate = 1.0;
    return {
      zone: 3,
      driftMs,
      appliedSpeed: 1.0,
      action: "HARD_SEEK",
    };
  }
}
