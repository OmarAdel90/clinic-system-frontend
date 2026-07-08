import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/clinic-frontend",
  assetPrefix: "/clinic-frontend/",
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
