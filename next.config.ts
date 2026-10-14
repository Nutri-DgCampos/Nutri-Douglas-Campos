import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera .next/standalone: um servidor Node enxuto, usado na imagem Docker.
  output: "standalone",
};

export default nextConfig;
