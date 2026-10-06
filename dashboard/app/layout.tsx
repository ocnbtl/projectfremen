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
import "./scrollbars.css";
import "./finance-accounts.css";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";
import NavigationHost from "../components/admin-shell/NavigationHost";
import LoadingHost from "../components/operational/LoadingHost";
import { PersistentSharedAIDockProvider } from "../components/admin-shell/SharedAIDock";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export const metadata: Metadata = {
  applicationName: "Unigentamos",
  title: "Unigentamos",
  description: "A collective of ventures, ideas, and experiences working towards a better world.",
  icons: {
    icon: [{ url: "/unigentamos-favicon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    shortcut: "/favicon-32.png",
    apple: "/apple-touch-icon.png"
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
        <LoadingHost><PersistentSharedAIDockProvider><NavigationHost>{children}</NavigationHost></PersistentSharedAIDockProvider></LoadingHost>
        <ServiceWorkerRegistration />
        {process.env.VERCEL === "1" ? <Analytics /> : null}
      </body>
    </html>
  );
}
