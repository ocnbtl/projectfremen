import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

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
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
