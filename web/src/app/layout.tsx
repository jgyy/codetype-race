import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeType Race",
  description: "Real-time multiplayer typing race for code snippets.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
