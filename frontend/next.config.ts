import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  experimental: {
    cpus: 6,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.INTERNAL_API_URL || "http://backend:8080/api"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
