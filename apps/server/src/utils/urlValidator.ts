/**
 * Utilitário de Validação Defensiva de URLs de Mídia
 * Previne esquemas maliciosos como javascript:, data:, file:, vbscript:, etc.
 */
export function isValidMediaUrl(inputUrl?: string | null): boolean {
  if (!inputUrl || typeof inputUrl !== "string") {
    return false;
  }

  const trimmed = inputUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    // Aceita estritamente conexões seguras ou web padrão (http/https)
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
