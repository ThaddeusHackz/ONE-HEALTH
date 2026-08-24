import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Next's built-in compression treats `text/*` as compressible, which buffers
   * `text/event-stream` until a block fills - that turns the agent's token
   * stream into one late dump. Render does not re-compress, so we disable it
   * here and keep streaming honest.
   */
  compress: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  serverExternalPackages: ["fflate", "pg"],
  experimental: {
    serverActions: { bodySizeLimit: "24mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(self), microphone=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
