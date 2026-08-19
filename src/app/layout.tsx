import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: {
    default: "WATER AI CLOUD — WhatsApp Automation Platform",
    template: "%s · WATER AI CLOUD",
  },
  description:
    "Powerful cloud platform for WhatsApp bots, automation, APIs, webhooks and AI.",
  keywords: [
    "whatsapp bot",
    "whatsapp automation",
    "bot cloud",
    "webhook",
    "rest api",
    "ai chatbot",
  ],
  openGraph: {
    title: "WATER AI CLOUD — WhatsApp Automation Platform",
    description:
      "Powerful cloud platform for WhatsApp bots, automation, APIs, webhooks and AI.",
    url: process.env.APP_URL || "http://localhost:3000",
    siteName: "WATER AI CLOUD",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WATER AI CLOUD — WhatsApp Automation Platform",
    description:
      "Powerful cloud platform for WhatsApp bots, automation, APIs, webhooks and AI.",
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
  applicationName: "WATER AI CLOUD",
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${space.variable}`}>
      <body className="min-h-screen bg-ink-950 text-slate-200">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  });
}
`,
          }}
        />
      </body>
    </html>
  );
}
