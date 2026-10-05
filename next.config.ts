import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The policy markdown is read at runtime, so bundle it with every server function
  outputFileTracingIncludes: {
    "/**/*": ["./data/**/*"],
  },
};

export default nextConfig;