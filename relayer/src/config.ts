import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name} (see .env.example)`);
  }
  return value;
}

export const config = {
  rpcUrl: requireEnv("ARC_TESTNET_RPC_URL"),
  chainId: Number(process.env.ARC_CHAIN_ID ?? 5042002),
  streamManagerAddress: requireEnv("STREAM_MANAGER_ADDRESS") as `0x${string}`,
  relayerPrivateKey: requireEnv("RELAYER_PRIVATE_KEY") as `0x${string}`,
  defaultGasFee: BigInt(process.env.DEFAULT_GAS_FEE_MICRO_USDC ?? "1000"),
  port: Number(process.env.PORT ?? 8787),
};
