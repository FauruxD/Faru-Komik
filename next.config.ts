import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["robots-parser", "impit"],
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
export default withWorkflow(config);
