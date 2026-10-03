import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/inconsolata/wght.css";
import "./globals.css";
import "./figma-transfer.css";
import "./people-transfer.css";
import "./people-interactions.css";
import "./people-profile-controls.css";
import "./finance-workspace.css";
import "./finance-split.css";
import "./module-continuity.css";
import "./workspace-system.css";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";
import NavigationHost from "../components/admin-shell/NavigationHost";
import { PersistentSharedAIDockProvider } from "../components/admin-shell/SharedAIDock";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export const metadata: Metadata = {
  applicationName: "Unigentamos",
  title: "Unigentamos",
  description: "A collective of ventures, ideas, and experiences working towards a better world.",
  icons: {
    icon: "/unigentamos-logo.svg",
    shortcut: "/unigentamos-logo.svg",
    apple: "/unigentamos-logo.svg"
  },
  openGraph: {
    title: "Unigentamos",
    description: "A collective of ventures, ideas, and experiences working towards a better world.",
    siteName: "Unigentamos"
  },
  twitter: {
    card: "summary",
    title: "Unigentamos",
    description: "A collective of ventures, ideas, and experiences working towards a better world."
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
        <PersistentSharedAIDockProvider><NavigationHost>{children}</NavigationHost></PersistentSharedAIDockProvider>
        <ServiceWorkerRegistration />
        {process.env.VERCEL === "1" ? <Analytics /> : null}
      </body>
    </html>
  );
}
