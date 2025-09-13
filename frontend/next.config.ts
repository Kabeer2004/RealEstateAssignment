import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        // This rewrites requests from /api/... to the backend service.
        // This is for production-like environments (docker-compose)
        // where the Next.js server handles server-side proxying.
        // It avoids CORS issues and hides the backend URL from the client.
        source: "/api/:path*",
        destination: "http://backend:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
