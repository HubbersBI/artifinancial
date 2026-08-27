import type { NextConfig } from "next";

// Set when the site is served from a subdirectory rather than a domain root -
// a GitHub Pages project site, for instance. Empty everywhere else.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
