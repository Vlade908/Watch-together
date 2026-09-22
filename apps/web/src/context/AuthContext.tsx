"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Film, Loader2 } from "lucide-react";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<{ success: boolean; error?: string }>;
  register: (data: { name: string; email: string; password: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  getAuthHeaders: () => Record<string, string>;
}

import { getApiBaseUrl } from "@/utils/network";
export { getApiBaseUrl };

export const setTokenCookie = (token: string) => {
  if (typeof document !== "undefined") {
    // Cookie acessível pelo middleware Next.js
    const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
    const secureFlag = isSecure ? "; Secure" : "";
    document.cookie = `watch_together_token=${encodeURIComponent(token)}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax${secureFlag}`;
  }
};

export const removeTokenCookie = () => {
  if (typeof document !== "undefined") {
    document.cookie = "watch_together_token=; path=/; max-age=0; SameSite=Lax";
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!token) return {};
    return {
      Authorization: `Bearer ${token}`,
    };
  }, [token]);

  // Carrega e valida o token no mount
  useEffect(() => {
    const storedToken = localStorage.getItem("watch_together_token");
    const storedUser = localStorage.getItem("watch_together_user");

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setTokenCookie(storedToken);
      } catch {
        localStorage.removeItem("watch_together_token");
        localStorage.removeItem("watch_together_user");
        removeTokenCookie();
      }
    }

    if (storedToken) {
      // Valida o token contra o endpoint /api/auth/me
      const apiBase = getApiBaseUrl();
      fetch(`${apiBase}/api/auth/me`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            localStorage.setItem("watch_together_user", JSON.stringify(data.user));
            setTokenCookie(storedToken);
          } else {
            // Token expirado ou inválido
            setToken(null);
            setUser(null);
            localStorage.removeItem("watch_together_token");
            localStorage.removeItem("watch_together_user");
            removeTokenCookie();
          }
        })
        .catch(() => {
          // Em caso de erro de rede mantemos a sessão local temporariamente
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem("watch_together_user", JSON.stringify(data.user));
      }
    } catch (err) {
      console.error("[Auth] Erro ao atualizar perfil:", err);
    }
  }, [token]);

  const login = async (credentials: { email: string; password: string }) => {
    setIsLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const sanitized = {
        email: credentials.email.toLowerCase().trim(),
        password: credentials.password,
      };
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitized),
      });

      const data = await res.json();

      if (!res.ok) {
        setIsLoading(false);
        return { success: false, error: data.message || "Credenciais inválidas" };
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("watch_together_token", data.token);
      localStorage.setItem("watch_together_user", JSON.stringify(data.user));
      setTokenCookie(data.token);
      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      return { success: false, error: "Falha de conexão com o servidor de autenticação." };
    }
  };

  const register = async (userData: { name: string; email: string; password: string }) => {
    setIsLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const sanitized = {
        name: userData.name.trim(),
        email: userData.email.toLowerCase().trim(),
        password: userData.password,
      };
      const res = await fetch(`${apiBase}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitized),
      });

      const data = await res.json();

      if (!res.ok) {
        setIsLoading(false);
        return {
          success: false,
          error: data.message || (data.errors ? data.errors[0]?.message : "Falha no cadastro"),
        };
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("watch_together_token", data.token);
      localStorage.setItem("watch_together_user", JSON.stringify(data.user));
      setTokenCookie(data.token);
      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      return { success: false, error: "Falha de conexão com o servidor de autenticação." };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("watch_together_token");
    localStorage.removeItem("watch_together_user");
    removeTokenCookie();
    router.push("/login");
  };

  const isPublicPage = pathname === "/login" || pathname === "/register";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        register,
        logout,
        refreshProfile,
        getAuthHeaders,
      }}
    >
      {/* Splash Screen cinematográfica anti-FOUC se estiver carregando autenticação em página protegida */}
      {isLoading && !isPublicPage && (
        <div className="fixed inset-0 z-[99999] bg-[#090a0d] flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#B20710] to-[#E50914] flex items-center justify-center shadow-xl shadow-[#E50914]/40 animate-pulse">
            <Film className="w-6 h-6 text-white" />
          </div>
          <div className="flex items-center space-x-2 text-neutral-400 text-xs font-mono">
            <Loader2 className="w-4 h-4 animate-spin text-[#E50914]" />
            <span>Validando sessão segura...</span>
          </div>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de um AuthProvider");
  }
  return context;
};
