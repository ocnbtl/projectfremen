import type { NextConfig } from "next";

const workspaceRoot = process.cwd();

const nextConfig: NextConfig = {
  // Vercel's injected Next 16.2 build adapter currently emits source paths
  // that its later packaging pass has already moved. An explicit empty value
  // takes precedence over NEXT_ADAPTER_PATH and keeps the established Vercel
  // Next.js builder active without changing application runtime behavior.
  adapterPath: "",
  outputFileTracingRoot: workspaceRoot,
  // Runtime state may live outside the deployment bundle. Package only the
  // checked-in seed/fallback data instead of tracing an arbitrary writable
  // directory back through the whole repository.
  outputFileTracingIncludes: {
    "/*": ["./data/**/*"]
  },
  turbopack: {
    root: workspaceRoot
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
