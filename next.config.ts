import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera .next/standalone: um servidor Node enxuto, usado na imagem Docker.
  output: "standalone",
  // Gerador de PDF roda só no servidor, fora do bundle (usa WebAssembly e fontes).
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
