import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  transpilePackages: ["@agenthub/shared", "@agenthub/adapter"],
  turbopack: {
    resolveAlias: {
      "@": "./packages/frontend/src",
    },
  },
};

export default nextConfig;
