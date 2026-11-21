import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@kapital/engine", "@kapital/server", "@kapital/content"],
  // Les paquets @kapital/* utilisent la convention TypeScript où les imports
  // relatifs portent l'extension .js mais pointent sur des fichiers .ts.
  // Il faut dire au bundler d'essayer .ts avant .js.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
