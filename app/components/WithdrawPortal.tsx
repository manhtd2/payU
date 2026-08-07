"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatUnits, parseUnits, stringToHex } from "viem";
import { arcTestnet } from "viem/chains";
import { useAccount, useReadContract, useSignTypedData, useWriteContract } from "wagmi";
import { STREAM_MANAGER_ADDRESS, RELAYER_URL, streamManagerAbi } from "@/lib/contracts";
import { streamedAsOf } from "@/lib/streaming";
import { StatusBadge, streamStatus } from "@/components/StatusBadge";
import { NumberTicker } from "@/components/NumberTicker";

const WITHDRAW_TYPES = {
  WithdrawAuthorization: [
    { name: "streamId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "gasFee", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

const DEFAULT_GAS_FEE = 1000n; // 0.001 USDC (6 decimals) — relayer's suggested fee, must stay <= on-chain MAX_GAS_FEE
const REFRESH_INTERVAL_MS = 15_000;

const FIELD_LABEL = "text-[0.72rem] tracking-[0.08em] text-ink-muted uppercase";
const FIELD_INPUT =
  "figures border-0 border-b-[1.5px] border-rule-strong bg-transparent px-0.5 pt-[6px] pb-2 text-[0.95rem] text-ink placeholder:text-ink-muted/60 focus:border-credit focus:outline-none";
const STAMP_BTN = "stamp-btn rounded-[2px] border-[1.5px] px-[22px] py-3 text-[0.92rem] font-bold tracking-[0.03em]";

export function WithdrawPortal() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const searchParams = useSearchParams();

  // Deep link from "Create stream" success screens (?streamId=123) — seeded as initial state
  // (not an effect) so it loads on the very first render instead of a flash of the empty form.
  const deepLinkedStreamId = searchParams.get("streamId");
  const [streamIdInput, setStreamIdInput] = useState(() => deepLinkedStreamId ?? "");
  const [streamId, setStreamId] = useState<bigint | null>(() => {
    if (!deepLinkedStreamId) return null;
    try {
      return BigInt(deepLinkedStreamId);
    } catch {
      return null;
    }
  });
  const [nowSeconds, setNowSeconds] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNowSeconds(BigInt(Math.floor(Date.now() / 1000))), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: stream, refetch } = useReadContract({
    address: STREAM_MANAGER_ADDRESS,
    abi: streamManagerAbi,
    functionName: "streams",
    args: streamId !== null ? [streamId] : undefined,
    query: { enabled: streamId !== null, refetchInterval: REFRESH_INTERVAL_MS },
  });

  const [sender, recipient, , totalAmount, ratePerSecond, startTime, stopTime, withdrawn, nonce, cancelled, cancelledAt] =
    stream ?? [];

  const withdrawable = useMemo(() => {
    if (stream === undefined || totalAmount === undefined) return 0n;
    const streamed = streamedAsOf(totalAmount, startTime!, stopTime!, cancelled!, cancelledAt!, nowSeconds);
    const w = streamed - withdrawn!;
    return w > 0n ? w : 0n;
  }, [stream, totalAmount, startTime, stopTime, cancelled, cancelledAt, withdrawn, nowSeconds]);

  const isRecipient = address && recipient && address.toLowerCase() === recipient.toLowerCase();
  const notFound = stream !== undefined && sender === "0x0000000000000000000000000000000000000000";
  const currentStatus = cancelled !== undefined && stopTime !== undefined ? streamStatus(cancelled, stopTime, nowSeconds) : null;
  const isLive = currentStatus === "active" || currentStatus === "ending-soon";

  const SECONDS_PER_DAY = 86_400n;
  const effectiveNow = cancelled && cancelledAt && cancelledAt < nowSeconds ? cancelledAt : nowSeconds;
  const totalDays =
    startTime !== undefined && stopTime !== undefined ? Number((stopTime - startTime) / SECONDS_PER_DAY) : 0;
  const elapsedDays =
    startTime !== undefined && stopTime !== undefined
      ? Math.min(totalDays, Math.max(0, Number((effectiveNow - startTime) / SECONDS_PER_DAY)))
      : 0;
  const elapsedFraction =
    startTime !== undefined && stopTime !== undefined && stopTime > startTime
      ? Math.min(1, Math.max(0, Number(effectiveNow - startTime) / Number(stopTime - startTime)))
      : 0;

  function loadStream(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    try {
      setStreamId(BigInt(streamIdInput));
    } catch {
      setError("Stream ID must be an integer.");
    }
  }

  function memoBytes(): `0x${string}` {
    return memo ? stringToHex(memo) : "0x";
  }

  function parseWithdrawAmount(): bigint | null {
    if (!withdrawAmount) return withdrawable > 0n ? withdrawable : null;
    try {
      return parseUnits(withdrawAmount, 6);
    } catch {
      return null;
    }
  }

  async function handleDirectWithdraw() {
    setError(null);
    setStatus(null);
    if (streamId === null) return;
    const amount = parseWithdrawAmount();
    if (!amount || amount <= 0n) {
      setError("Invalid withdrawal amount.");
      return;
    }
    try {
      setStatus("Submitting withdrawal transaction...");
      const hash = await writeContractAsync({
        address: STREAM_MANAGER_ADDRESS,
        abi: streamManagerAbi,
        functionName: "withdraw",
        args: [streamId, amount, memoBytes()],
      });
      setStatus(`Withdrawn. Tx: ${hash}`);
      refetch();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Withdrawal failed.");
      setStatus(null);
    }
  }

  async function handleGaslessWithdraw() {
    setError(null);
    setStatus(null);
    if (streamId === null || nonce === undefined) return;
    const amount = parseWithdrawAmount();
    if (!amount || amount <= 0n) {
      setError("Invalid withdrawal amount.");
      return;
    }
    if (amount <= DEFAULT_GAS_FEE) {
      setError("Withdrawal amount must be greater than the relayer's gas fee (0.001 USDC).");
      return;
    }
    try {
      setStatus("Signing off-chain authorization...");
      const signature = await signTypedDataAsync({
        domain: {
          name: "PayUStreamManager",
          version: "1",
          chainId: arcTestnet.id,
          verifyingContract: STREAM_MANAGER_ADDRESS,
        },
        types: WITHDRAW_TYPES,
        primaryType: "WithdrawAuthorization",
        message: { streamId, amount, gasFee: DEFAULT_GAS_FEE, nonce },
      });

      setStatus("Sending to relayer...");
      const res = await fetch(`${RELAYER_URL}/withdraw-for`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId: streamId.toString(),
          amount: amount.toString(),
          gasFee: DEFAULT_GAS_FEE.toString(),
          memo: memoBytes(),
          signature,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Relayer rejected the request.");

      setStatus(`Relayer submitted. Tx: ${body.txHash}`);
      refetch();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Gasless withdrawal failed.");
      setStatus(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={loadStream} className="flex gap-3">
        <input
          className={`flex-1 ${FIELD_INPUT}`}
          placeholder="Stream ID (e.g. 0)"
          value={streamIdInput}
          onChange={(e) => setStreamIdInput(e.target.value)}
        />
        <button type="submit" className={`${STAMP_BTN} border-ink text-ink`}>
          View stream
        </button>
      </form>

      {notFound && <p className="text-sm text-debit">Stream not found.</p>}

      {stream && !notFound && totalAmount !== undefined && (
        <div className="relative flex flex-col gap-4 rounded-[2px] bg-paper-panel px-6 py-[22px]">
          {isLive && (
            <span className="absolute -top-[10px] left-[18px] -rotate-2 rounded-[2px] bg-credit px-2 py-[3px] text-[0.62rem] font-bold tracking-[0.12em] text-paper">
              LIVE ENTRY
            </span>
          )}
          <div className="flex items-center justify-between">
            <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-muted">Recipient</dt>
              <dd className="figures truncate text-ink">{recipient}</dd>
              <dt className="text-ink-muted">Total stream</dt>
              <dd className="figures text-ink">{formatUnits(totalAmount, 6)}</dd>
              <dt className="text-ink-muted">Withdrawn</dt>
              <dd className="figures text-ink">{formatUnits(withdrawn!, 6)}</dd>
              <dt className="text-ink-muted">Rate</dt>
              <dd className="figures text-ink">{formatUnits(ratePerSecond!, 6)} / second</dd>
            </dl>
            <StatusBadge status={streamStatus(cancelled!, stopTime!, nowSeconds)} />
          </div>

          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-ink-muted">
              Available to withdraw (real-time, client-side)
            </p>
            <p className="figures text-4xl font-bold text-credit">
              <NumberTicker value={Number(formatUnits(withdrawable, 6))} />
            </p>

            {startTime !== undefined && stopTime !== undefined && (
              <div className="mt-3 flex flex-col gap-1">
                <div className="h-1 w-full overflow-hidden bg-rule">
                  <div className="h-full bg-credit" style={{ width: `${elapsedFraction * 100}%` }} />
                </div>
                <p className="figures text-xs text-ink-muted">
                  {elapsedDays} of {totalDays} days elapsed · {formatUnits(totalAmount, 6)} total stream
                </p>
              </div>
            )}
          </div>

          {!isRecipient && isConnected && (
            <p className="text-sm text-warn">
              The connected wallet is not this stream’s recipient — view-only, withdrawals disabled.
            </p>
          )}

          <label className={`flex flex-col gap-1.5 ${FIELD_LABEL}`}>
            Amount to withdraw (leave blank to withdraw everything available)
            <input
              className={FIELD_INPUT}
              type="number"
              min="0"
              step="any"
              placeholder={formatUnits(withdrawable, 6)}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
          </label>

          <label className={`flex flex-col gap-1.5 ${FIELD_LABEL}`}>
            Memo (pay period, contract ID...)
            <input className={FIELD_INPUT} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDirectWithdraw}
              disabled={!isRecipient || withdrawable === 0n}
              className={`${STAMP_BTN} border-credit bg-credit text-paper disabled:opacity-40`}
            >
              Withdraw
            </button>
            <button
              type="button"
              onClick={handleGaslessWithdraw}
              disabled={!isRecipient || withdrawable === 0n}
              className={`${STAMP_BTN} border-credit text-credit disabled:opacity-40`}
            >
              Withdraw (gasless)
            </button>
          </div>

          {status && <p className="text-sm text-ink-muted">{status}</p>}
          {error && <p className="text-sm text-debit">{error}</p>}
        </div>
      )}
    </div>
  );
}
