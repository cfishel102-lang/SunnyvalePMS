import type { NextConfig } from "next";

// Every page in this app shows live reservation data, so pages are rendered
// per request rather than cached.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
