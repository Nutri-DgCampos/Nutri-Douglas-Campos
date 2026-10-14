import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "primeicons/primeicons.css";
import "./globals.css";
import Provedores from "@/components/Provedores";
import RegistrarServiceWorker from "./RegistrarServiceWorker";

// Corpo do texto e títulos. As fontes são baixadas no build e servidas pelo próprio app.
const fonteCorpo = Figtree({
  variable: "--fonte-corpo",
  subsets: ["latin"],
});

const fonteTitulo = Bricolage_Grotesque({
  variable: "--fonte-titulo",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Acompanhamento Nutricional",
  description: "Sistema de acompanhamento nutricional para pacientes.",
  applicationName: "Acompanhamento Nutricional",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Acompanhamento Nutricional",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Usa a área atrás do entalhe e da barra de gestos (aplicativo instalado).
  viewportFit: "cover",
  themeColor: "#06372b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${fonteCorpo.variable} ${fonteTitulo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Provedores>
          <RegistrarServiceWorker />
          {children}
        </Provedores>
      </body>
    </html>
  );
}
