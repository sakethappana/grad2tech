import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["embedded-postgres", "pg-boss", "pg"],
  experimental: {
    // Assignment and doubt uploads (10 MB per file by default) travel through Server Actions.
    serverActions: { bodySizeLimit: "26mb" },
  },
  async rewrites() {
    return {
      // The approved public website is served unchanged at "/".
      beforeFiles: [{ source: "/", destination: "/site/index.html" }],
    };
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The Full Stack Workspace runs WebContainers, which need cross-origin isolation.
        source: "/portal/student/workspace/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      { source: "/monaco/:path*", headers: [{ key: "Cross-Origin-Resource-Policy", value: "same-origin" }] },
      { source: "/portal/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default config;
