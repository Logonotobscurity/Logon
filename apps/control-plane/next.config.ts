import type { NextConfig } from "next";

const apiUrl = process.env.LOGON_CONTROL_PLANE_API_URL ?? "http://127.0.0.1:4100";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: apiUrl.replace(/\/$/, "") + "/api/:path*"
      }
    ];
  }
};

export default nextConfig;
