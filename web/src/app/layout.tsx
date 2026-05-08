import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { SkipLink } from "@/components/a11y/SkipLink";
import { SwBootstrap } from "@/components/SwBootstrap";
import { OfflineBanner } from "@/components/OfflineBanner";
import { InstallPrompt } from "@/components/InstallPrompt";

export const metadata: Metadata = {
  title: "CodeType Race",
  description: "Real-time multiplayer typing race for code snippets.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CodeType",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <SkipLink />
        <SwBootstrap />
        <OfflineBanner />
        <Nav />
        <main id="main">{children}</main>
        <InstallPrompt />
      </body>
    </html>
  );
}
