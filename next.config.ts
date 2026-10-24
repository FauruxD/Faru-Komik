import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  experimental: {
    optimizePackageImports: ["@cloudflare/kumo", "@phosphor-icons/react"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.shngm.id" },
      { protocol: "https", hostname: "storage.shngm.id" },
      { protocol: "https", hostname: "delivery.shngm.id" },
      { protocol: "https", hostname: "mirror1.shngm.id" },
      { protocol: "https", hostname: "mirror2.shngm.id" },
    ],
  },
};
export default config;
