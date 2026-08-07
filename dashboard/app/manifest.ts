import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Unigentamos",
    short_name: "Unigentamos",
    description: "Encrypted local-first operations workspace",
    start_url: "/vault",
    display: "standalone",
    background_color: "#f3f6f4",
    theme_color: "#173b35",
    icons: [
      {
        src: "/unigentamos-logo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
