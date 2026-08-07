"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { parseEventLogs, parseUnits, isAddress, formatUnits } from "viem";
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

const START_TIME_BUFFER_SECONDS = 60;
const MAX_BATCH_SIZE = 50; // must match StreamManager.MAX_BATCH_SIZE — CSVs larger than this are auto-chunked

const FIELD_LABEL = "text-[0.72rem] tracking-[0.08em] text-ink-muted uppercase";
const FIELD_INPUT =
  "figures border-0 border-b-[1.5px] border-rule-strong bg-transparent px-0.5 pt-[6px] pb-2 text-[0.95rem] text-ink placeholder:text-ink-muted/60 focus:border-credit focus:outline-none";
const TEXTAREA =
  "figures min-h-32 rounded-[2px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-credit focus:outline-none";

type Mode = "csv" | "list";

interface Row {
  recipient: `0x${string}`;
  totalAmount: bigint;
  duration: bigint;
}

interface SkippedRow {
  line: number;
  raw: string;
  reason: string;
}

/** Plain-decimal check ahead of parseUnits: `<input type="number">` and CSV exports both allow
 * strings parseUnits can't handle (scientific notation like "1e21", stray commas, ...). Number()
 * would happily parse those into a finite value and let a bad amount slip through, so we gate on
 * the exact shape parseUnits expects instead of trusting Number()'s leniency. */
function parseAmount(raw: string): bigint | null {
  if (!/^\d*\.?\d*$/.test(raw) || raw === "" || raw === ".") return null;
  try {
    const amount = parseUnits(raw, 6);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}

/** Same defensiveness for duration: reject non-finite results (e.g. "1e400" parses to Infinity,
 * which crashes BigInt(Math.round(...)) rather than throwing something catchable). */
function parseDurationDays(raw: string): bigint | null {
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) return null;
  return BigInt(Math.round(days * 86400));
}

/** Full CSV mode: each line carries its own amount and duration. */
function parseCsv(text: string): { rows: Row[]; skipped: SkippedRow[] } {
  const rows: Row[] = [];
  const skipped: SkippedRow[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  lines.forEach((line, i) => {
    const [rawRecipient, rawAmount, rawDurationDays] = line.split(",").map((v) => v.trim());
    if (!rawRecipient || !rawAmount || !rawDurationDays) {
      skipped.push({ line: i + 1, raw: line, reason: "Expected wallet_address,amount,days" });
      return;
    }
    if (!isAddress(rawRecipient)) {
      // Line 1 not looking like an address is almost always a header row ("address,amount,days") — skip quietly.
      if (i === 0) return;
      skipped.push({ line: i + 1, raw: line, reason: "Invalid wallet address" });
      return;
    }
    const totalAmount = parseAmount(rawAmount);
    if (totalAmount === null) {
      skipped.push({ line: i + 1, raw: line, reason: "Invalid amount" });
      return;
    }
    const duration = parseDurationDays(rawDurationDays);
    if (duration === null) {
      skipped.push({ line: i + 1, raw: line, reason: "Invalid duration" });
      return;
    }
    rows.push({ recipient: rawRecipient as `0x${string}`, totalAmount, duration });
  });

  return { rows, skipped };
}

/** Simple list mode: just wallet addresses (one per line, or comma/whitespace separated —
 * anything after the address on a line, e.g. a name column, is ignored). The same amount and
 * duration apply to every address. */
function parseAddressList(text: string): `0x${string}`[] {
  const candidates = text.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
  const seen = new Set<string>();
  const addresses: `0x${string}`[] = [];
  for (const candidate of candidates) {
    if (!isAddress(candidate)) continue;
    const lower = candidate.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    addresses.push(candidate as `0x${string}`);
  }
  return addresses;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Status = "idle" | "approving" | "creating" | "done" | "error";

export function BatchUploadForm() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("csv");
  const [tokenIndex, setTokenIndex] = useState(0);
  const [csvText, setCsvText] = useState("");
  const [listText, setListText] = useState("");
  const [uniformAmount, setUniformAmount] = useState("");
  const [uniformDurationDays, setUniformDurationDays] = useState("7");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [streamIds, setStreamIds] = useState<bigint[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  const token = SUPPORTED_TOKENS[tokenIndex];

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    if (mode === "csv") setCsvText(text);
    else setListText(text);
  }

  const addresses = useMemo(() => (mode === "list" ? parseAddressList(listText) : []), [mode, listText]);

  const csvResult = useMemo(() => (mode === "csv" ? parseCsv(csvText) : null), [mode, csvText]);

  const listResult = useMemo(() => {
    if (mode !== "list" || addresses.length === 0) return { rows: [] as Row[], error: null as string | null };
    const totalAmount = parseAmount(uniformAmount);
    if (totalAmount === null) return { rows: [], error: "Enter a valid amount per contractor." };
    const duration = parseDurationDays(uniformDurationDays);
    if (duration === null) return { rows: [], error: "Enter a valid duration in days." };
    return { rows: addresses.map((recipient) => ({ recipient, totalAmount, duration })), error: null };
  }, [mode, addresses, uniformAmount, uniformDurationDays]);

  const rows = mode === "csv" ? csvResult?.rows ?? [] : listResult.rows;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStreamIds([]);

    if (!address || !publicClient) {
      setError("Connect your wallet first.");
      return;
    }

    if (rows.length === 0) {
      setError(
        mode === "csv"
          ? "No valid rows found. Format: address,amount,days per line."
          : "Add at least one valid wallet address, an amount, and a duration."
      );
      return;
    }

    try {
      const totalAmount = rows.reduce((sum, r) => sum + r.totalAmount, 0n);
      const startTime = BigInt(Math.floor(Date.now() / 1000) + START_TIME_BUFFER_SECONDS);

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
      const chunks = chunk(rows, MAX_BATCH_SIZE);
      const txHashes: string[] = [];
      const createdStreamIds: bigint[] = [];
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Sending batch ${i + 1}/${chunks.length} (${chunks[i].length} contractors)…`);
        const params = chunks[i].map((r) => ({
          recipient: r.recipient,
          token: token.address,
          totalAmount: r.totalAmount,
          startTime,
          duration: r.duration,
        }));
        const hash = await writeContractAsync({
          address: STREAM_MANAGER_ADDRESS,
          abi: streamManagerAbi,
          functionName: "createBatch",
          args: [params],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        // Read the new stream IDs straight off the receipt instead of depending on the
        // (separately rate-limited) getLogs scan in StreamsOverview to surface them.
        for (const log of parseEventLogs({ abi: [streamCreatedEvent], logs: receipt.logs })) {
          createdStreamIds.push(log.args.streamId);
        }
        txHashes.push(hash);
      }

      setProgress(null);
      setStatus("done");
      setStreamIds(createdStreamIds);
      appendCreationHistory(address, {
        id: txHashes[0],
        createdAt: Date.now(),
        kind: "batch",
        tokenSymbol: token.symbol,
        recipients: rows.map((r) => r.recipient),
        totalAmount: formatUnits(totalAmount, 6),
        txHashes,
        streamIds: createdStreamIds.map((id) => id.toString()),
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
      <SectionTitle>Batch payment</SectionTitle>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-[2px] bg-paper-panel px-7 pt-[26px] pb-7">
        <div className="flex gap-6 border-b border-rule-strong text-sm">
          <button
            type="button"
            onClick={() => setMode("csv")}
            className={`border-b-2 pb-2 font-bold transition-colors ${
              mode === "csv" ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Full CSV
          </button>
          <button
            type="button"
            onClick={() => setMode("list")}
            className={`border-b-2 pb-2 font-bold transition-colors ${
              mode === "list" ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Wallet list (same terms)
          </button>
        </div>

        <label className={`flex flex-col gap-1.5 ${FIELD_LABEL}`}>
          Token for the whole batch
          <select className={FIELD_INPUT} value={tokenIndex} onChange={(e) => setTokenIndex(Number(e.target.value))}>
            {SUPPORTED_TOKENS.map((t, i) => (
              <option key={t.symbol} value={i}>
                {t.symbol}
              </option>
            ))}
          </select>
        </label>

        {mode === "csv" ? (
          <>
            <p className="text-sm text-ink-muted">
              Each line: <code className="figures">wallet_address,amount,days</code>. Automatically split across
              multiple transactions if there are more than {MAX_BATCH_SIZE} rows.
            </p>
            <div className="flex items-center gap-3">
              <label className="stamp-btn cursor-pointer rounded-[2px] border-[1.5px] border-ink px-3 py-1.5 text-sm font-bold text-ink">
                Choose file
                <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
              </label>
              <span className="text-sm text-ink-muted">{fileName ?? "No file chosen"}</span>
            </div>
            <textarea
              className={TEXTAREA}
              placeholder={"0xabc...,500,7\n0xdef...,750,7"}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <p className="text-sm text-ink-muted">{rows.length} valid rows detected.</p>
            {rows.length === 0 &&
              csvResult &&
              csvResult.skipped.length > 0 &&
              csvResult.skipped.every((s) => s.reason === "Expected wallet_address,amount,days") && (
                <div className="rounded-[2px] bg-credit-soft p-3 text-xs text-ink">
                  Looks like this file only has wallet addresses, no amount or duration per line.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setListText(csvText);
                      setMode("list");
                    }}
                    className="font-bold text-credit underline hover:no-underline"
                  >
                    Switch to “Wallet list (same terms)”
                  </button>{" "}
                  to set one amount and duration for everyone instead.
                </div>
              )}
            {csvResult && csvResult.skipped.length > 0 && (
              <div className="rounded-[2px] bg-warn-soft p-3 text-xs text-ink">
                <p className="font-bold">
                  {csvResult.skipped.length} row{csvResult.skipped.length === 1 ? "" : "s"} skipped:
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {csvResult.skipped.map((s) => (
                    <li key={s.line}>
                      Line {s.line}: {s.reason} — <span className="figures">{s.raw}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              Upload or paste an existing wallet list — one address per line (or comma/space
              separated). Everyone gets the same amount and duration below.
            </p>
            <div className="flex items-center gap-3">
              <label className="stamp-btn cursor-pointer rounded-[2px] border-[1.5px] border-ink px-3 py-1.5 text-sm font-bold text-ink">
                Choose file
                <input type="file" accept=".csv,.txt,text/plain,text/csv" onChange={handleFile} className="hidden" />
              </label>
              <span className="text-sm text-ink-muted">{fileName ?? "No file chosen"}</span>
            </div>
            <textarea
              className={TEXTAREA}
              placeholder={"0xabc...\n0xdef...\n0x123..."}
              value={listText}
              onChange={(e) => setListText(e.target.value)}
            />

            <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2">
              <label className={`flex flex-col gap-1.5 ${FIELD_LABEL}`}>
                Amount per contractor
                <input
                  className={FIELD_INPUT}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="500"
                  value={uniformAmount}
                  onChange={(e) => setUniformAmount(e.target.value)}
                />
              </label>
              <label className={`flex flex-col gap-1.5 ${FIELD_LABEL}`}>
                Duration (days)
                <input
                  className={FIELD_INPUT}
                  type="number"
                  min="0"
                  step="any"
                  value={uniformDurationDays}
                  onChange={(e) => setUniformDurationDays(e.target.value)}
                />
              </label>
            </div>

            <p className="text-sm text-ink-muted">
              {addresses.length} wallet address{addresses.length === 1 ? "" : "es"} detected
              {rows.length > 0 && ` — ${rows.length} stream${rows.length === 1 ? "" : "s"} ready to create`}.
            </p>
            {listResult.error && addresses.length > 0 && <p className="text-sm text-debit">{listResult.error}</p>}
          </>
        )}

        <button
          type="submit"
          disabled={!isConnected || busy || rows.length === 0}
          className="stamp-btn mt-[22px] self-start rounded-[2px] border-[1.5px] border-credit bg-credit px-[22px] py-3 text-[0.92rem] font-bold tracking-[0.03em] text-paper disabled:opacity-40"
        >
          {status === "approving" && "Approving token…"}
          {status === "creating" && (progress ?? "Creating batch…")}
          {(status === "idle" || status === "done" || status === "error") && `Create ${rows.length} streams`}
        </button>

        {error && <p className="text-sm text-debit">{error}</p>}
        {status === "done" && (
          <p className="text-sm text-credit">
            {streamIds.length > 0 ? (
              <>
                {streamIds.length} stream{streamIds.length === 1 ? "" : "s"} created — ID
                {streamIds.length === 1
                  ? ` #${streamIds[0]}`
                  : `s #${streamIds[0]}–#${streamIds[streamIds.length - 1]}`}
                {" · "}
                <Link href={`/withdraw?streamId=${streamIds[0]}`} className="underline hover:no-underline">
                  Open first stream in contractor portal
                </Link>
                {" · "}
                <CopyStreamLinkButton streamId={streamIds[0]} />
                {streamIds.length > 1 && " (each contractor's own ID is in the Streams overview table below)"}
              </>
            ) : (
              "Batch created successfully."
            )}
          </p>
        )}
      </form>
    </>
  );
}
