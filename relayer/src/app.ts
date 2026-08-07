import express, { type Request, type Response } from "express";
import cors from "cors";
import { config } from "./config.js";
import { submitWithdrawFor, RelayerValidationError } from "./relayer.js";

export const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

function parseHexBytes(value: unknown, field: string): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new RelayerValidationError(`${field} must be a 0x-prefixed hex string`);
  }
  return value as `0x${string}`;
}

function parseBigInt(value: unknown, field: string): bigint {
  try {
    if (typeof value !== "string" && typeof value !== "number") throw new Error();
    return BigInt(value);
  } catch {
    throw new RelayerValidationError(`${field} must be an integer (string or number)`);
  }
}

app.post("/withdraw-for", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const streamId = parseBigInt(body.streamId, "streamId");
    const amount = parseBigInt(body.amount, "amount");
    const gasFee = parseBigInt(body.gasFee ?? config.defaultGasFee, "gasFee");
    const memo = parseHexBytes(body.memo ?? "0x", "memo");
    const signature = parseHexBytes(body.signature, "signature");

    const result = await submitWithdrawFor({ streamId, amount, gasFee, memo, signature });
    res.json({ txHash: result.txHash, relayer: result.relayer });
  } catch (err) {
    if (err instanceof RelayerValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("withdraw-for failed:", err);
    res.status(500).json({ error: "Internal relayer error" });
  }
});
