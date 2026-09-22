"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  X,
  FileVideo,
  Globe,
  Film,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  ShieldCheck,
  FolderOpen,
} from "lucide-react";
import { MediaSourceType } from "../../types/sync";
import {
  calculateSparseFingerprint,
  FileFingerprintResult,
  formatBytes,
  extractCleanMediaTitle,
} from "../../services/mediaFingerprint";

interface SourceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  currentSourceType: MediaSourceType;
  expectedFingerprint?: string;
  remoteDirectUrl?: string;
  currentMediaTitle?: string;
  onSelectLocalFile: (file: File, fingerprint: string, title?: string) => void;
  onSelectDirectUrl?: (url: string, title?: string) => void;
  onSelectCatalogDemo?: () => void;
}

export function SourceSelectorModal({
  isOpen,
  onClose,
  isHost,
  currentSourceType,
  expectedFingerprint,
  remoteDirectUrl,
  currentMediaTitle,
  onSelectLocalFile,
  onSelectDirectUrl,
  onSelectCatalogDemo,
}: SourceSelectorModalProps) {
  // Abas: "LOCAL_FILE", "DIRECT_URL", "CATALOG_DEMO"
  const [activeTab, setActiveTab] = useState<MediaSourceType>(currentSourceType);

  // Mantém a aba ativa sincronizada com a modalidade atual da sala
  useEffect(() => {
    setActiveTab(currentSourceType);
  }, [currentSourceType]);

  // Estados do Arquivo Local
  const [dragActive, setDragActive] = useState(false);
  const [isHashing, setIsHashing] = useState(false);
  const [calculatedFingerprint, setCalculatedFingerprint] = useState<FileFingerprintResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localTitleInput, setLocalTitleInput] = useState("");

  // Estados de URL Direta
  const [directUrlInput, setDirectUrlInput] = useState("");
  const [directTitleInput, setDirectTitleInput] = useState("");
  const [urlError, setUrlError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Processa o arquivo selecionado e calcula o fingerprint amostral SHA-256
  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    setSelectedFile(file);
    setIsHashing(true);
    setUrlError("");

    // Sugere título limpo a partir do nome do arquivo
    const suggestedTitle = extractCleanMediaTitle(file.name);
    setLocalTitleInput(suggestedTitle);

    try {
      const result = await calculateSparseFingerprint(file);
      setCalculatedFingerprint(result);
    } catch (err) {
      console.error("[SourceSelectorModal] Erro ao calcular hash:", err);
    } finally {
      setIsHashing(false);
    }
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleConfirmLocalFile = () => {
    if (selectedFile && calculatedFingerprint) {
      onSelectLocalFile(selectedFile, calculatedFingerprint.fingerprint, localTitleInput.trim() || undefined);
      onClose();
    }
  };

  const handleConfirmDirectUrl = () => {
    const trimmed = directUrlInput.trim();
    if (!trimmed) {
      setUrlError("Insira uma URL válida.");
      return;
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setUrlError("Apenas protocolos HTTP e HTTPS são suportados.");
        return;
      }
    } catch {
      setUrlError("URL inválida ou malformatada.");
      return;
    }

    onSelectDirectUrl?.(trimmed, directTitleInput.trim() || undefined);
    onClose();
  };

  // Confirmação de Catálogo Demo
  const handleConfirmDemo = () => {
    if (onSelectCatalogDemo) {
      onSelectCatalogDemo();
    }
    onClose();
  };

  // Verificação de compatibilidade de hash para convidados
  const isMatchingExpected =
    calculatedFingerprint &&
    expectedFingerprint &&
    calculatedFingerprint.fingerprint === expectedFingerprint;

  const isMismatch =
    calculatedFingerprint &&
    expectedFingerprint &&
    calculatedFingerprint.fingerprint !== expectedFingerprint;

  // Trava de segurança: impede montagem/abertura para convidados se o Host ainda não tiver definido a mídia
  if (!isOpen) return null;
  if (!isHost && !expectedFingerprint && !remoteDirectUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#141414] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-neutral-200">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-[#E50914]/20 text-[#E50914]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {isHost ? "Selecionar Fonte de Mídia (BYOM)" : "Carregar Conteúdo da Sessão"}
              </h2>
              <p className="text-[11px] text-neutral-400">
                Arquitetura descentralizada com Risco Zero e sincronia NTP sub-50ms
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas de Modalidade (Se for Host pode escolher qualquer uma; Viewer foca na modalidade ativa) */}
        {isHost ? (
          <div className="grid grid-cols-3 gap-1.5 p-3 bg-black/40 border-b border-white/10">
            <button
              onClick={() => setActiveTab("LOCAL_FILE")}
              className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "LOCAL_FILE"
                  ? "bg-[#E50914] text-white shadow-md shadow-[#E50914]/20"
                  : "bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <FileVideo className="w-3.5 h-3.5" />
              <span>Ficheiro Local</span>
            </button>
            <button
              onClick={() => setActiveTab("DIRECT_URL")}
              className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "DIRECT_URL"
                  ? "bg-[#E50914] text-white shadow-md shadow-[#E50914]/20"
                  : "bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>URL Direta</span>
            </button>
            <button
              onClick={() => setActiveTab("CATALOG_DEMO")}
              className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "CATALOG_DEMO"
                  ? "bg-[#E50914] text-white shadow-md shadow-[#E50914]/20"
                  : "bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Catálogo Demo</span>
            </button>
          </div>
        ) : (
          <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-none text-amber-400" />
            <span>
              O anfitrião configurou a sala para reprodução de{" "}
              <strong>
                {currentSourceType === "LOCAL_FILE"
                  ? "Ficheiro Local (Syncplay Web)"
                  : currentSourceType === "DIRECT_URL"
                  ? "URL Direta"
                  : "Catálogo de Demonstração"}
              </strong>
              .
            </span>
          </div>
        )}

        {/* Corpo do Modal de acordo com a Aba */}
        <div className="p-6 space-y-4">
          {!isHost && currentSourceType === "DIRECT_URL" ? (
            <div className="py-8 px-4 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#E50914]/20 text-[#E50914] flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Conectando à Transmissão Remota...
                </h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                  O anfitrião configurou a reprodução via URL Direta
                  {currentMediaTitle ? ` ("${currentMediaTitle}")` : ""}. A stream remota será carregada diretamente no seu player sem necessidade de carregar ficheiros.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={onClose}
                  className="py-2 px-6 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white transition-colors cursor-pointer"
                >
                  Fechar Janela
                </button>
              </div>
            </div>
          ) : !isHost && currentSourceType === "CATALOG_DEMO" ? (
            <div className="py-8 px-4 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#38bdf8]/20 text-[#38bdf8] flex items-center justify-center">
                <Film className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Catálogo Oficial de Demonstração
                </h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                  O anfitrião ativou o stream demonstrativo oficial em HLS. O player sincronizará automaticamente.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={onClose}
                  className="py-2 px-6 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white transition-colors cursor-pointer"
                >
                  Fechar Janela
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ================= ABA 1: FICHEIRO LOCAL ================= */}
              {activeTab === "LOCAL_FILE" && (
                <div className="space-y-4">
                  {/* Box de Informações de Neutralidade */}
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-start space-x-2.5 text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 flex-none mt-0.5" />
                    <div className="text-neutral-300 space-y-0.5">
                      <p className="font-semibold text-white">Privacidade & Fidelidade Total (BYOM):</p>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        O ficheiro é reproduzido localmente a partir do seu disco (sem envio para a nuvem).
                        Apenas o hash amostral é comparado para garantir a mesma edição.
                      </p>
                    </div>
                  </div>

                  {/* Se for Convidado, mostra o título esperado */}
                  {!isHost && currentMediaTitle && (
                    <div className="p-2.5 rounded-lg bg-black/50 border border-white/10 text-xs flex items-center justify-between">
                      <span className="text-neutral-400">Título esperado pelo Host:</span>
                      <span className="font-bold text-white">{currentMediaTitle}</span>
                    </div>
                  )}

                  {/* Dropzone de Upload */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/x-matroska,.mkv"
                    onChange={handleInputChange}
                    className="hidden"
                  />

                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      dragActive
                        ? "border-[#E50914] bg-[#E50914]/10"
                        : selectedFile
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : "border-white/20 hover:border-white/40 bg-black/30 hover:bg-black/40"
                    }`}
                  >
                    {isHashing ? (
                      <div className="flex flex-col items-center justify-center space-y-2 py-3">
                        <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
                        <p className="text-xs font-semibold text-white">
                          Calculando fingerprint amostral SHA-256...
                        </p>
                        <p className="text-[10px] text-neutral-400">Amostragem rápida dos blocos do container</p>
                      </div>
                    ) : selectedFile && calculatedFingerprint ? (
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white truncate max-w-xs">{selectedFile.name}</p>
                          <p className="text-[11px] text-neutral-400">
                            {calculatedFingerprint.formattedSize} · Hash:{" "}
                            <span className="font-mono text-emerald-300">
                              {calculatedFingerprint.fingerprint.substring(0, 12)}...
                            </span>
                          </p>
                        </div>
                        <span className="text-[10px] text-[#38bdf8] underline pt-1">
                          Clique para escolher outro arquivo
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-2 py-2">
                        <UploadCloud className="w-8 h-8 text-neutral-400" />
                        <div>
                          <p className="text-xs font-semibold text-white">
                            Arraste seu ficheiro de vídeo aqui ou clique para selecionar
                          </p>
                          <p className="text-[10px] text-neutral-400">Suporta .mp4, .webm e .mkv</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status de Correspondência de Hash para Convidado */}
                  {!isHost && calculatedFingerprint && expectedFingerprint && (
                    <div>
                      {isMatchingExpected ? (
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-none" />
                          <span>
                            <strong>Correspondência Perfeita!</strong> O seu arquivo possui exatamente a mesma versão do
                            anfitrião.
                          </span>
                        </div>
                      ) : isMismatch ? (
                        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 flex-none" />
                          <span>
                            <strong>Aviso de Discrepância:</strong> O hash do seu arquivo difere do anfitrião. A
                            sincronização de tempo funcionará normalmente, mas pode haver variações de cortes.
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Campo de Título Editável para o Host */}
                  {isHost && selectedFile && (
                    <div className="space-y-1.5 text-left">
                      <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider block">
                        Título da Sessão (Exibido aos convidados e amigos)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Interestelar 2014"
                        value={localTitleInput}
                        onChange={(e) => setLocalTitleInput(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 focus:border-[#E50914] focus:outline-none text-xs text-white placeholder-neutral-500"
                      />
                    </div>
                  )}

                  {/* Botão de Confirmação */}
                  <button
                    disabled={!selectedFile || isHashing}
                    onClick={handleConfirmLocalFile}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#B20710] to-[#E50914] hover:from-[#c20812] hover:to-[#ff2b36] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-[#E50914]/20 cursor-pointer"
                  >
                    {isHost ? "Definir Ficheiro na Sala" : "Carregar Ficheiro para Sincronia"}
                  </button>
                </div>
              )}

              {/* ================= ABA 2: URL DIRETA ================= */}
              {activeTab === "DIRECT_URL" && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-neutral-300 space-y-1">
                    <p className="font-semibold text-white">Nuvem Pessoal & Links Diretos:</p>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      Insira o link HTTPS de um arquivo (.mp4, .webm) ou manifesto HLS (.m3u8) hospedado em seu
                      servidor pessoal, WebDAV ou armazenamento na nuvem.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider block">
                      URL Direta do Vídeo (HTTPS)
                    </label>
                    <input
                      type="url"
                      placeholder="https://exemplo.com/meu-video.mp4"
                      value={directUrlInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDirectUrlInput(val);
                        if (val && !directTitleInput.trim()) {
                          setDirectTitleInput(extractCleanMediaTitle(val));
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 focus:border-[#E50914] focus:outline-none text-xs text-white placeholder-neutral-500 font-mono"
                    />
                    {urlError && <p className="text-[11px] text-red-400">{urlError}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider block">
                      Título do Vídeo (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Minha Gravação 4K"
                      value={directTitleInput}
                      onChange={(e) => setDirectTitleInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 focus:border-[#E50914] focus:outline-none text-xs text-white placeholder-neutral-500"
                    />
                  </div>

                  <button
                    onClick={handleConfirmDirectUrl}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#B20710] to-[#E50914] hover:from-[#c20812] hover:to-[#ff2b36] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-[#E50914]/20 cursor-pointer"
                  >
                    Transmitir via URL Direta
                  </button>
                </div>
              )}

              {/* ================= ABA 3: CATÁLOGO DEMO ================= */}
              {activeTab === "CATALOG_DEMO" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-black/50 border border-white/10 space-y-2">
                    <div className="flex items-center space-x-2 text-white font-semibold text-xs">
                      <Film className="w-4 h-4 text-[#38bdf8]" />
                      <span>Stream Demonstrativo Oficial (HLS ABR)</span>
                    </div>
                    <p className="text-xs text-neutral-400">
                      Transmissão oficial do Mux com múltiplos bitrates dinâmicos (1080p, 720p, 480p, 360p) para
                      teste de latência e validação da telemetria sub-50ms do Cristian's Algorithm.
                    </p>
                  </div>

                  <button
                    onClick={handleConfirmDemo}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#B20710] to-[#E50914] hover:from-[#c20812] hover:to-[#ff2b36] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-[#E50914]/20 cursor-pointer"
                  >
                    Ativar Catálogo de Demonstração
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
