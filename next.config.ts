import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Jangan bundle Baileys / native deps ke Turbopack — pakai require runtime Node
  serverExternalPackages: [
    "@sairidev/baileys-new",
    "@whiskeysockets/baileys",
    "@napi-rs/image",
    "libsignal",
    "protobufjs",
    "qrcode",
    "pino",
    "sharp",
    "jimp",
    "ffmpeg-static",
    "file-type",
    "pdf-lib",
    "e2b",
    "ws",
    "music-metadata",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
