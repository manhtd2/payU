import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { arcTestnet } from "viem/chains";

// Explicit wallet list (rather than RainbowKit's getDefaultConfig) so we don't pull in the
// Coinbase/Base Account connector — its @coinbase/cdp-sdk dependency references an optional
// @x402/svm package that isn't installed and breaks the Next.js build.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, walletConnectWallet, rainbowWallet, injectedWallet],
    },
  ],
  {
    appName: "PayU",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "payu-dev-placeholder",
  }
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [arcTestnet],
  // Bare http() falls back to viem's built-in default RPC for arcTestnet — a shared public
  // endpoint that Arc's own docs warn is rate-limited. Point at our configured RPC instead.
  transports: { [arcTestnet.id]: http(process.env.NEXT_PUBLIC_ARC_RPC_URL) },
  ssr: true,
});
