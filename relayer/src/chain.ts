import { createPublicClient, createWalletClient, http } from "viem";
import { arcTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

export const relayerAccount = privateKeyToAccount(config.relayerPrivateKey);

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(config.rpcUrl),
});

export const walletClient = createWalletClient({
  account: relayerAccount,
  chain: arcTestnet,
  transport: http(config.rpcUrl),
});
