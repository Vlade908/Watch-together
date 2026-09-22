/**
 * Limitador de Taxa Sliding-Window em Memória por Conexão WebSocket
 * Previne ataques de negação de serviço (DoS), flooding de chat e exaustão de CPU/Redis.
 */
export class SocketRateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 25, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Registra a mensagem e valida se está dentro dos limites de vazão permitidos.
   * @returns true se a mensagem pode ser processada, false se excedeu o limite.
   */
  public consume(): boolean {
    const now = Date.now();
    // Descarta timestamps mais antigos que a janela
    this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  /**
   * Reseta o histórico de requisições
   */
  public reset(): void {
    this.timestamps = [];
  }
}
