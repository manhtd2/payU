import { verifyTypedData } from "viem";
import { publicClient, walletClient, relayerAccount } from "./chain.js";
import { config } from "./config.js";
import { streamManagerAbi } from "./abi/streamManager.js";

const WITHDRAW_TYPES = {
  WithdrawAuthorization: [
    { name: "streamId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "gasFee", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface WithdrawForRequest {
  streamId: bigint;
  amount: bigint;
  gasFee: bigint;
  memo: `0x${string}`;
  signature: `0x${string}`;
}

/** Thrown for any request-side problem — callers should surface this as HTTP 400. */
export class RelayerValidationError extends Error {}

export async function submitWithdrawFor(req: WithdrawForRequest) {
  const stream = await publicClient.readContract({
    address: config.streamManagerAddress,
    abi: streamManagerAbi,
    functionName: "streams",
    args: [req.streamId],
  });
  const [sender, recipient, , , , , , , onChainNonce] = stream;

  if (sender === ZERO_ADDRESS) {
    throw new RelayerValidationError("Stream not found");
  }

  const maxGasFee = await publicClient.readContract({
    address: config.streamManagerAddress,
    abi: streamManagerAbi,
    functionName: "MAX_GAS_FEE",
  });
  if (req.gasFee > maxGasFee) {
    throw new RelayerValidationError(`gasFee ${req.gasFee} exceeds on-chain MAX_GAS_FEE ${maxGasFee}`);
  }
  if (req.gasFee > req.amount) {
    throw new RelayerValidationError("gasFee exceeds amount");
  }

  const withdrawable = await publicClient.readContract({
    address: config.streamManagerAddress,
    abi: streamManagerAbi,
    functionName: "balanceOf",
    args: [req.streamId],
  });
  if (req.amount > withdrawable) {
    throw new RelayerValidationError(`amount ${req.amount} exceeds withdrawable ${withdrawable}`);
  }

  const domain = {
    name: "PayUStreamManager",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.streamManagerAddress,
  } as const;

  // Pre-flight check only — the contract independently re-verifies on-chain. Catching a stale
  // or forged signature here just saves the recipient a doomed transaction's worth of latency.
  const isValid = await verifyTypedData({
    address: recipient,
    domain,
    types: WITHDRAW_TYPES,
    primaryType: "WithdrawAuthorization",
    message: {
      streamId: req.streamId,
      amount: req.amount,
      gasFee: req.gasFee,
      nonce: onChainNonce,
    },
    signature: req.signature,
  });
  if (!isValid) {
    throw new RelayerValidationError("Signature does not match stream recipient for the current on-chain nonce");
  }

  const txHash = await walletClient.writeContract({
    address: config.streamManagerAddress,
    abi: streamManagerAbi,
    functionName: "withdrawFor",
    args: [req.streamId, req.amount, req.gasFee, req.memo, req.signature],
  });

  return { txHash, relayer: relayerAccount.address };
}
