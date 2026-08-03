import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // pdfkit ships its standard-14-font metrics as .afm data files loaded via a path relative to
  // its own module at runtime — bundling it (like any asset-bearing native-ish package) breaks
  // that lookup, the same reason @prisma/client/prisma are already listed here.
  serverExternalPackages: ["@prisma/client", "prisma", "pdfkit"],
  allowedDevOrigins: [
    "preview-chat-03635107-6dad-436e-bec1-cb9b769b0587.space-z.ai",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;