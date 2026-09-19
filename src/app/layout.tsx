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

const themeBootScript = `(function(){try{var t=localStorage.getItem('wai-theme');if(t==='neon-white'||t==='neon-black'){document.documentElement.dataset.theme=t;}else{document.documentElement.dataset.theme='neon-black';}}catch(e){document.documentElement.dataset.theme='neon-black';}})();`;

const swScript = `if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){});});}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${space.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body
        data-theme="neon-black"
        className="neon-root min-h-screen bg-ink-950 text-slate-200 relative overflow-x-hidden"
        suppressHydrationWarning
      >
        {/* Animated background aurora and glowing lighting */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="anim-aurora bg-cyan-500/10 w-[500px] h-[500px] -top-32 -left-32 animate-[aurora-move_20s_ease-in-out_infinite]" />
          <div
            className="anim-aurora bg-blue-600/10 w-[600px] h-[600px] top-1/2 -right-48 animate-[aurora-move_25s_ease-in-out_infinite_reverse]"
            style={{ animationDelay: "-5s" }}
          />
          <div
            className="anim-aurora bg-teal-400/10 w-[450px] h-[450px] -bottom-32 left-1/3 animate-[aurora-move_22s_ease-in-out_infinite]"
            style={{ animationDelay: "-10s" }}
          />
        </div>
        <div className="relative z-10">{children}</div>
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
