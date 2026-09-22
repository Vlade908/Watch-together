/**
 * Utilitários centralizados de resolução de rede para API HTTP e WebSockets
 * Garante URLs limpas e seguras em produção (Vercel/Render) sem portas fixas indevidas
 * e preserva suporte automático a testes em rede local (LAN).
 */

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
  );
}

/**
 * Retorna a URL base do WebSocket sem portas hardcoded em produção
 */
export function getWsBaseUrl(): string {
  const envWsUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
  const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  // 1. Se NEXT_PUBLIC_WS_URL foi explicitamente configurada:
  if (envWsUrl) {
    let url = envWsUrl
      .replace(/^http:\/\//i, "ws://")
      .replace(/^https:\/\//i, "wss://");

    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      const defaultProto =
        typeof window !== "undefined" && window.location.protocol === "https:"
          ? "wss://"
          : "ws://";
      url = `${defaultProto}${url}`;
    }

    // Apenas substitui 'localhost' se o cliente navegador estiver acessando via IP da LAN
    if (typeof window !== "undefined") {
      const currentHost = window.location.hostname;
      if (
        (url.includes("localhost") || url.includes("127.0.0.1")) &&
        isLocalHostname(currentHost) &&
        currentHost !== "localhost" &&
        currentHost !== "127.0.0.1"
      ) {
        url = url.replace("localhost", currentHost).replace("127.0.0.1", currentHost);
      }
    }

    return url.replace(/\/+$/, "");
  }

  // 2. Se NEXT_PUBLIC_WS_URL não foi definida, deriva de NEXT_PUBLIC_API_URL caso exista
  if (envApiUrl) {
    let url = envApiUrl
      .replace(/^http:\/\//i, "ws://")
      .replace(/^https:\/\//i, "wss://");

    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      const defaultProto =
        typeof window !== "undefined" && window.location.protocol === "https:"
          ? "wss://"
          : "ws://";
      url = `${defaultProto}${url}`;
    }

    if (typeof window !== "undefined") {
      const currentHost = window.location.hostname;
      if (
        (url.includes("localhost") || url.includes("127.0.0.1")) &&
        isLocalHostname(currentHost) &&
        currentHost !== "localhost" &&
        currentHost !== "127.0.0.1"
      ) {
        url = url.replace("localhost", currentHost).replace("127.0.0.1", currentHost);
      }
    }

    return url.replace(/\/+$/, "");
  }

  // 3. Fallback inteligente quando nenhuma variável de ambiente está definida:
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname || "localhost";
    const isLocal = isLocalHostname(hostname);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

    // Apenas concatena porta :4000 em ambiente local de desenvolvimento
    if (isLocal) {
      return `${protocol}//${hostname}:4000`;
    }

    // Em produção (ex: Vercel), NUNCA adiciona :4000; usa a mesma origem
    return `${protocol}//${window.location.host}`;
  }

  return "ws://localhost:4000";
}

/**
 * Retorna a URL base da API HTTP sem portas hardcoded em produção
 */
export function getApiBaseUrl(): string {
  const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (envApiUrl) {
    let url = envApiUrl;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      const defaultProto =
        typeof window !== "undefined" && window.location.protocol === "https:"
          ? "https://"
          : "http://";
      url = `${defaultProto}${url}`;
    }

    if (typeof window !== "undefined") {
      const currentHost = window.location.hostname;
      if (
        (url.includes("localhost") || url.includes("127.0.0.1")) &&
        isLocalHostname(currentHost) &&
        currentHost !== "localhost" &&
        currentHost !== "127.0.0.1"
      ) {
        url = url.replace("localhost", currentHost).replace("127.0.0.1", currentHost);
      }
    }

    return url.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname || "localhost";
    const isLocal = isLocalHostname(hostname);
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";

    if (isLocal) {
      return `${protocol}//${hostname}:4000`;
    }

    return `${protocol}//${window.location.host}`;
  }

  return "http://localhost:4000";
}
