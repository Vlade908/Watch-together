import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Rotas públicas que não requerem autenticação
const PUBLIC_PATHS = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Ignora requisições de arquivos estáticos, assets, favicon e API interna do Next
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("watch_together_token")?.value;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path);

  // 1. Visitante não autenticado tentando acessar rota protegida (/, /watch/...)
  if (!token && !isPublicPath) {
    const fullTargetUrl = `${pathname}${search}`;
    const loginUrl = new URL("/login", request.url);
    if (fullTargetUrl !== "/") {
      loginUrl.searchParams.set("redirect", fullTargetUrl);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 2. Usuário autenticado tentando acessar telas públicas (/login, /register)
  if (token && isPublicPath) {
    const redirectParam = request.nextUrl.searchParams.get("redirect");
    const targetUrl = redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";
    return NextResponse.redirect(new URL(targetUrl, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Aplica o middleware a todas as rotas exceto assets estáticos:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, icon.svg
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
