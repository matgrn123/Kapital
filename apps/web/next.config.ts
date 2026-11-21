import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@kapital/engine", "@kapital/server", "@kapital/content"],
};

export default nextConfig;
