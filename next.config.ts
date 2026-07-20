import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ["@prisma/client", "prisma"],
  allowedDevOrigins: [
    "preview-chat-03635107-6dad-436e-bec1-cb9b769b0587.space-z.ai",
  ],
};

export default nextConfig;