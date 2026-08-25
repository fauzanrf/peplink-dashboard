import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'peplink-mobile.internetwork.net.id',
    'peplink-mobile.internetwork.net.id:443',
    'peplink-mobile.internetwork.net.id:80',
    '94.237.73.21',
    '94.237.73.21:3000',
    'localhost:3000'
  ],
};

export default nextConfig;
