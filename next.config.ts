import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "d2fwno52vggyhx.cloudfront.net",
        pathname: "/items/**",
      },
    ],
  },
};

export default nextConfig;
