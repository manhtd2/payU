// Minimal ABI slice the relayer needs — kept in sync by hand with contracts/src/StreamManager.sol.
// If the contract interface changes, update this alongside it.
export const streamManagerAbi = [
  {
    type: "function",
    name: "streams",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
      { name: "totalAmount", type: "uint256" },
      { name: "ratePerSecond", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "stopTime", type: "uint256" },
      { name: "withdrawn", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "cancelled", type: "bool" },
      { name: "cancelledAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [{ name: "withdrawable", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_GAS_FEE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdrawFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "streamId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "gasFee", type: "uint256" },
      { name: "memo", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
