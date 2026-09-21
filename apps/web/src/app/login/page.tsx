"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Film, Lock, Mail, Eye, EyeOff, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated } = useAuth();

  const redirectParam = searchParams.get("redirect");
  const targetRedirect = redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Se já estiver logado, redireciona para o destino pretendido
  React.useEffect(() => {
    if (isAuthenticated) {
      router.push(targetRedirect);
    }
  }, [isAuthenticated, targetRedirect, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Por favor, preencha todos os campos.");
      return;
    }

    setIsSubmitting(true);
    const result = await login({ email, password });
    setIsSubmitting(false);

    if (result.success) {
      router.push(targetRedirect);
    } else {
      setError(result.error || "Falha na autenticação");
    }
  };

  const isRoomInvite = redirectParam?.includes("mode=room");

  return (
    <div className="w-full max-w-md bg-[#141414]/85 backdrop-blur-2xl border border-white/10 rounded-2xl p-8 sm:p-10 shadow-2xl shadow-black/80">
      <div className="mb-8 text-center sm:text-left">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
          Entrar na sua conta
        </h1>
        <p className="text-sm text-neutral-400">
          {isRoomInvite
            ? "Conecte-se para entrar diretamente na sala de Watch Together com seus amigos."
            : "Conecte-se para sincronizar filmes e interagir com seus amigos em tempo real."}
        </p>
      </div>

      {isRoomInvite && (
        <div className="mb-6 p-3 bg-[#E50914]/15 border border-[#E50914]/30 rounded-xl flex items-center space-x-2.5 text-neutral-200 text-xs">
          <Sparkles className="w-4 h-4 text-[#E50914] flex-shrink-0" />
          <span>Você foi convidado para uma sessão Watch Together! Faça login para participar.</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center space-x-3 text-red-400 text-sm animate-in fade-in zoom-in-95">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-[#E50914]" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-2">
            E-mail
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
              <Mail className="w-4 h-4" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@exemplo.com"
              required
              className="w-full pl-10 pr-4 py-3 bg-[#222222]/80 border border-white/10 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-[#E50914] focus:ring-2 focus:ring-[#E50914]/20 transition-all duration-200"
            />
          </div>
        </div>

        {/* Senha */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
              Senha
            </label>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full pl-10 pr-11 py-3 bg-[#222222]/80 border border-white/10 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-[#E50914] focus:ring-2 focus:ring-[#E50914]/20 transition-all duration-200"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Botão de Login */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-[#B20710] via-[#E50914] to-[#ff2b36] hover:from-[#c20812] hover:to-[#ff3d47] text-white font-bold rounded-xl shadow-lg shadow-[#E50914]/30 hover:shadow-[#E50914]/50 transition-all duration-300 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Autenticando...</span>
            </>
          ) : (
            <span>Acessar Plataforma</span>
          )}
        </button>
      </form>

      {/* Divisor */}
      <div className="mt-8 pt-6 border-t border-white/10 text-center">
        <p className="text-sm text-neutral-400">
          Novo no Watch Together?{" "}
          <Link
            href={redirectParam ? `/register?redirect=${encodeURIComponent(redirectParam)}` : "/register"}
            className="font-semibold text-white hover:text-[#E50914] transition-colors inline-flex items-center"
          >
            Crie sua conta agora
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full bg-[#090a0d] flex flex-col justify-between overflow-hidden selection:bg-[#E50914] selection:text-white">
      {/* Background Cinematográfico */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 20%, rgba(229, 9, 20, 0.25) 0%, rgba(9, 10, 13, 0.8) 50%, #090a0d 100%)",
        }}
      />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      {/* Header com Logo */}
      <header className="relative z-10 w-full px-6 md:px-16 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#B20710] to-[#E50914] flex items-center justify-center shadow-lg shadow-[#E50914]/30 group-hover:scale-105 transition-transform duration-300">
            <Film className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl md:text-2xl font-black tracking-tighter text-white uppercase bg-gradient-to-r from-white via-neutral-100 to-neutral-400 bg-clip-text">
            Watch<span className="text-[#E50914]">Together</span>
          </span>
        </Link>
      </header>

      {/* Container Central com Suspense */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <Suspense
          fallback={
            <div className="p-8 flex items-center justify-center text-neutral-400">
              <Loader2 className="w-6 h-6 animate-spin text-[#E50914]" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full px-6 py-4 text-center text-xs text-neutral-600">
        <p>© 2026 Watch Together. Todos os direitos reservados. Streaming síncrono de alta performance.</p>
      </footer>
    </div>
  );
}
