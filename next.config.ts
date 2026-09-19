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

/** Native / Node-only packages — jangan di-bundle Turbopack */
const serverExternals = [
  "@stazyu/baileys",
  "@sairidev/baileys-new",
  "@whiskeysockets/baileys",
  "@roamhq/wrtc",
  "@roamhq/wrtc-linux-x64",
  "@roamhq/wrtc-linux-arm64",
  "@roamhq/wrtc-darwin-x64",
  "@roamhq/wrtc-darwin-arm64",
  "@roamhq/wrtc-win32-x64",
  "wrtc",
  "libsignal",
  "protobufjs",
  "@napi-rs/image",
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
  "pg",
  "drizzle-orm",
];

const nextConfig: NextConfig = {
  serverExternalPackages: serverExternals,
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
