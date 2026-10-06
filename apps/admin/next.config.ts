import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le package partagé est en TypeScript source : Next doit le compiler.
  transpilePackages: ["@union/shared"],
};

export default nextConfig;
