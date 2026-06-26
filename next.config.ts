import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // node-postgres + its Cloudflare socket shim must not be bundled by Next/OpenNext
  // (esbuild can't resolve pg-cloudflare's conditional exports). Treat as external
  // runtime deps so they load from node_modules in the Worker.
  serverExternalPackages: ["pg", "pg-cloudflare"],
};

export default nextConfig;
