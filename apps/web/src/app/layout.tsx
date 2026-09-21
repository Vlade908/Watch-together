import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { SocialProvider } from "@/context/SocialContext";
import { PartyHUD } from "@/components/PartyHUD";

export const metadata: Metadata = {
  title: "Watch Together | Streaming de Alta Performance & Salas Síncronas",
  description: "Plataforma de streaming cinematográfica com catálogo adaptativo HLS/DASH, salas de reprodução síncronas Watch Together e recomendações contextuais inteligentes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body
        className="bg-[#090a0d] text-[#f4f4f6] min-h-screen antialiased selection:bg-[#e50914] selection:text-white"
        suppressHydrationWarning
      >
        <AuthProvider>
          <SocialProvider>
            {children}
            <PartyHUD />
          </SocialProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

