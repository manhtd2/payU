import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // RainbowKit bundles a Coinbase/Base Account connector whose @coinbase/cdp-sdk dependency
  // does a runtime-only dynamic import of an optional @x402/svm package we don't install (we
  // never use that payment flow). Keeping it external stops the build from trying to
  // statically resolve that import.
  serverExternalPackages: ["@coinbase/cdp-sdk", "@base-org/account"],
};

export default nextConfig;
