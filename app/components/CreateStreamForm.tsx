"use client";

import Link from "next/link";
import { useState } from "react";
import { formatUnits, parseEventLogs, parseUnits, isAddress } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  STREAM_MANAGER_ADDRESS,
  SUPPORTED_TOKENS,
  erc20Abi,
  streamCreatedEvent,
  streamManagerAbi,
} from "@/lib/contracts";
import { appendCreationHistory } from "@/lib/history";
import { CopyStreamLinkButton } from "@/components/CopyStreamLinkButton";
import { SectionTitle } from "@/components/SectionTitle";

const START_TIME_BUFFER_SECONDS = 60; // guards against local clock drift vs. chain time

const FIELD_LABEL = "text-[0.72rem] tracking-[0.08em] text-ink-muted uppercase";
const FIELD_INPUT =
  "figures border-0 border-b-[1.5px] border-rule-strong bg-transparent px-0.5 pt-[6px] pb-2 text-[0.95rem] text-ink placeholder:text-ink-muted/60 focus:border-credit focus:outline-none";

type Status = "idle" | "approving" | "creating" | "done" | "error";

export function CreateStreamForm() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const [recipient, setRecipient] = useState("");
  const [tokenIndex, setTokenIndex] = useState(0);
  const [amount, setAmount] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [streamTxHash, setStreamTxHash] = useState<string | null>(null);
  const [streamId, setStreamId] = useState<bigint | null>(null);

  const token = SUPPORTED_TOKENS[tokenIndex];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStreamId(null);

    if (!address || !publicClient) {
      setError("Connect your wallet first.");
      return;
    }
    if (!isAddress(recipient)) {
      setError("Invalid contractor address.");
      return;
    }
    const amountNum = Number(amount);
    const durationNum = Number(durationDays);
    if (!(amountNum > 0)) {
      setError("Amount must be greater than 0.");
      return;
    }
    if (!(durationNum > 0)) {
      setError("Duration must be greater than 0 days.");
      return;
    }

    try {
      const totalAmount = parseUnits(amount, 6);
      const startTime = BigInt(Math.floor(Date.now() / 1000) + START_TIME_BUFFER_SECONDS);
      const duration = BigInt(Math.round(durationNum * 86400));

      const balance = await publicClient.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      if (balance < totalAmount) {
        setError(
          `Insufficient ${token.symbol} balance: you have ${formatUnits(balance, 6)}, need ${formatUnits(totalAmount, 6)}.`
        );
        return;
      }

      setStatus("approving");
      const approveHash = await writeContractAsync({
        address: token.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [STREAM_MANAGER_ADDRESS, totalAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      setStatus("creating");
      const createHash = await writeContractAsync({
        address: STREAM_MANAGER_ADDRESS,
        abi: streamManagerAbi,
        functionName: "createStream",
        args: [recipient as `0x${string}`, token.address, totalAmount, startTime, duration],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });

      // Read the new stream's ID straight off the receipt we already fetched, instead of
      // depending on the (separately rate-limited) getLogs scan in StreamsOverview to surface it.
      const [created] = parseEventLogs({ abi: [streamCreatedEvent], logs: receipt.logs });
      const newStreamId = created?.args.streamId ?? null;
      setStreamId(newStreamId);

      setStreamTxHash(createHash);
      setStatus("done");
      appendCreationHistory(address, {
        id: createHash,
        createdAt: Date.now(),
        kind: "single",
        tokenSymbol: token.symbol,
        recipients: [recipient],
        totalAmount: amount,
        txHashes: [createHash],
        streamIds: newStreamId !== null ? [newStreamId.toString()] : [],
      });
      queryClient.invalidateQueries({ queryKey: ["my-streams", address] });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Transaction failed.");
      setStatus("error");
    }
  }

  const busy = status === "approving" || status === "creating";

  return (
    <>
      <SectionTitle>Create a single stream</SectionTitle>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-[2px] bg-paper-panel px-7 pt-[26px] pb-7">
        <label className={`flex flex-col gap-1.5 ${FIELD_LABEL}`}>
          Contractor address
          <input
            className={FIELD_INPUT}
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            required
          />
        </label>

        <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-3">
          <label className={`flex flex-col gap-1.5 ${FIELD_LABEL}`}>
            Token
            <select
              className={FIELD_INPUT}
              value={tokenIndex}
              onChange={(e) => setTokenIndex(Number(e.target.value))}
            >
              {SUPPORTED_TOKENS.map((t, i) => (
                <option key={t.symbol} value={i}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </label>

          <label className={`flex flex-col gap-1.5 ${FIELD_LABEL}`}>
            Total amount
            <input
              className={FIELD_INPUT}
              type="number"
              min="0"
              step="any"
              placeholder="1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>

          <label className={`flex flex-col gap-1.5 ${FIELD_LABEL}`}>
            Duration (days)
            <input
              className={FIELD_INPUT}
              type="number"
              min="0"
              step="any"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              required
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!isConnected || busy}
          className="stamp-btn mt-[22px] self-start rounded-[2px] border-[1.5px] border-credit bg-credit px-[22px] py-3 text-[0.92rem] font-bold tracking-[0.03em] text-paper disabled:opacity-40"
        >
          {status === "approving" && "Approving token…"}
          {status === "creating" && "Creating stream…"}
          {(status === "idle" || status === "done" || status === "error") && "Create stream"}
        </button>

        {error && <p className="text-sm text-debit">{error}</p>}
        {status === "done" && streamTxHash && (
          <p className="text-sm text-credit">
            Stream created{streamId !== null && <> — ID #{streamId.toString()}</>}. Tx: {streamTxHash}
            {streamId !== null && (
              <>
                {" · "}
                <Link href={`/withdraw?streamId=${streamId}`} className="underline hover:no-underline">
                  Open in contractor portal
                </Link>
                {" · "}
                <CopyStreamLinkButton streamId={streamId} />
              </>
            )}
          </p>
        )}
      </form>
    </>
  );
}
