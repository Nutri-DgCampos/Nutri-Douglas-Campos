import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "primeicons/primeicons.css";
import "./globals.css";
import Provedores from "@/components/Provedores";
import RegistrarServiceWorker from "./RegistrarServiceWorker";

// Corpo do texto e títulos. As fontes vêm dos pacotes @fontsource (as mesmas
// do Google Fonts, licença OFL) e são servidas pelo próprio app: o build não
// depende de acesso à internet.
const fonteCorpo = localFont({
  variable: "--fonte-corpo",
  src: "../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
  weight: "300 900",
  style: "normal",
  display: "swap",
});

const fonteTitulo = localFont({
  variable: "--fonte-titulo",
  src: "../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
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
