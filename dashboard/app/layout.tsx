import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/inconsolata/wght.css";
import "./globals.css";
import "./figma-transfer.css";

export const metadata: Metadata = {
  applicationName: "Unigentamos",
  title: "Unigentamos",
  description: "Internal operations dashboard for Unigentamos and brand projects.",
  icons: {
    icon: "/unigentamos-logo.svg",
    shortcut: "/unigentamos-logo.svg",
    apple: "/unigentamos-logo.svg"
  },
  openGraph: {
    title: "Unigentamos",
    description: "Internal operations dashboard for Unigentamos and brand projects.",
    siteName: "Unigentamos"
  },
  twitter: {
    card: "summary",
    title: "Unigentamos",
    description: "Internal operations dashboard for Unigentamos and brand projects."
  },
  appleWebApp: {
    capable: true,
    title: "Unigentamos",
    statusBarStyle: "default"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
