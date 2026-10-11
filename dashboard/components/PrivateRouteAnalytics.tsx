"use client";
import { Analytics } from "@vercel/analytics/next";
export default function PrivateRouteAnalytics() {
  return <Analytics beforeSend={event => new URL(event.url).pathname.startsWith("/book/") ? null : event} />;
}
