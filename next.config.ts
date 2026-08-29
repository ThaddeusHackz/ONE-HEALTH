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
  /**
   * `pg` optionally loads `pg-native` (a compiled C++ binding) when it is
   * installed. It never is here, but webpack still tries to RESOLVE the
   * require chain pg → pg/lib/native → pg-native, and the resulting
   * "Module not found" poisons every route that transitively imports pg in
   * `next dev` - every API call 500s until the page is recompiled. Aliasing
   * the optional binding to `false` yields an empty module, which is exactly
   * what pg's own try/catch expects when the native driver is absent.
   */
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), "pg-native": false };
    return config;
  },
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
