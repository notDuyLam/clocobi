import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:3000"}/:path*`,
      },
    ];
  },
  // Spike S3: SPIKE_ISOLATE=true makes the spike page cross-origin isolated (COOP/COEP)
  // to compare speed. Remove with the spike.
  async headers() {
    if (process.env.SPIKE_ISOLATE !== "true") return [];
    return [
      {
        source: "/spike/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
