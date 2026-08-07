"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { STREAM_MANAGER_ADDRESS, SUPPORTED_TOKENS, streamManagerAbi } from "@/lib/contracts";
import { getCreationHistorySnapshot } from "@/lib/history";
import { streamedAsOf } from "@/lib/streaming";
import { StatusBadge, streamStatus } from "@/components/StatusBadge";
import { NumberTicker } from "@/components/NumberTicker";
import { SectionTitle } from "@/components/SectionTitle";

const SECONDS_PER_30_DAYS = 30n * 86_400n;

interface StreamRow {
  streamId: bigint;
  recipient: `0x${string}`;
  token: `0x${string}`;
  totalAmount: bigint;
  ratePerSecond: bigint;
  startTime: bigint;
  stopTime: bigint;
  withdrawn: bigint;
  cancelled: boolean;
  cancelledAt: bigint;
}

function truncate(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function tokenSymbol(address: string) {
  return SUPPORTED_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase())?.symbol ?? "?";
}

export function StreamsOverview() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [nowSeconds, setNowSeconds] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNowSeconds(BigInt(Math.floor(Date.now() / 1000))), 1000);
    return () => clearInterval(id);
  }, []);

  const { data, error, refetch } = useQuery({
    queryKey: ["my-streams", address],
    enabled: Boolean(address && publicClient),
    refetchInterval: 20_000,
    queryFn: async (): Promise<StreamRow[]> => {
      if (!address || !publicClient) return [];

      // Sourced from this browser's own record of streams it created (Creation history,
      // in localStorage) rather than an eth_getLogs scan of chain history. Arc's public
      // testnet RPC rate-limits eth_getLogs over large block ranges hard enough that
      // scanning back to the deployment block was unreliable in practice — every scan
      // needs the full historical range and this RPC just doesn't have the quota for it.
      // Trade-off: a stream created from a different browser/device won't appear here;
      // look it up directly in the Contractor portal by ID instead.
      const streamIds = [
        ...new Set(getCreationHistorySnapshot(address).flatMap((r) => r.streamIds.map((id) => BigInt(id)))),
      ];

      return Promise.all(
        streamIds.map(async (streamId) => {
          const s = await publicClient.readContract({
            address: STREAM_MANAGER_ADDRESS,
            abi: streamManagerAbi,
            functionName: "streams",
            args: [streamId],
          });
          return {
            streamId,
            recipient: s[1],
            token: s[2],
            totalAmount: s[3],
            ratePerSecond: s[4],
            startTime: s[5],
            stopTime: s[6],
            withdrawn: s[7],
            cancelled: s[9],
            cancelledAt: s[10],
          };
        })
      );
    },
  });

  async function handleCancel(streamId: bigint) {
    if (!publicClient) return;
    setCancelError(null);
    setCancellingId(streamId.toString());
    try {
      const hash = await writeContractAsync({
        address: STREAM_MANAGER_ADDRESS,
        abi: streamManagerAbi,
        functionName: "cancelStream",
        args: [streamId],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      refetch();
    } catch (err) {
      console.error(err);
      setCancelError(err instanceof Error ? err.message : "Cancel failed.");
    } finally {
      setCancellingId(null);
    }
  }

  // `data === undefined` (rather than the query's isLoading flag) is what actually distinguishes
  // "we don't have an answer yet" from "we checked and there's nothing" — isLoading can go false
  // while data is still undefined and no error was set, e.g. if the fetch gets cancelled/aborted
  // mid-flight (enabled toggling, a remount, ...) without ever settling. Trusting isLoading alone
  // meant that case rendered as a confident "no streams", which is simply wrong.
  const pending = data === undefined;
  const rows = useMemo(() => [...(data ?? [])].sort((a, b) => Number(b.streamId - a.streamId)), [data]);

  const stats = useMemo(() => {
    const monthStart = BigInt(
      Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000)
    );

    const perToken = new Map<string, { locked: bigint; streamedThisMonth: bigint }>();
    let activeCount = 0;
    const contractors = new Set<string>();

    for (const s of rows) {
      contractors.add(s.recipient.toLowerCase());

      const streamedNow = streamedAsOf(s.totalAmount, s.startTime, s.stopTime, s.cancelled, s.cancelledAt, nowSeconds);
      const streamedAtMonthStart = streamedAsOf(
        s.totalAmount,
        s.startTime,
        s.stopTime,
        s.cancelled,
        s.cancelledAt,
        monthStart
      );
      const locked = s.cancelled ? streamedNow - s.withdrawn : s.totalAmount - s.withdrawn;

      const entry = perToken.get(s.token) ?? { locked: 0n, streamedThisMonth: 0n };
      entry.locked += locked;
      entry.streamedThisMonth += streamedNow - streamedAtMonthStart;
      perToken.set(s.token, entry);

      const status = streamStatus(s.cancelled, s.stopTime, nowSeconds);
      if (status === "active" || status === "ending-soon") activeCount++;
    }

    return { perToken, activeCount, contractorCount: contractors.size };
  }, [rows, nowSeconds]);

  return (
    <>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[0.72rem] font-bold uppercase tracking-wide text-ink-muted underline hover:text-ink hover:no-underline"
          >
            Refresh
          </button>
        }
      >
        Streams overview
      </SectionTitle>

      <div className="my-7 grid grid-cols-2 gap-[14px] sm:grid-cols-4">
        <div className="rounded-[2px] bg-credit-soft px-[18px] py-4">
          <span className="mb-2 block text-[0.7rem] font-bold tracking-[0.14em] text-ink-muted uppercase">Treasury balance</span>
          {stats.perToken.size === 0 ? (
            <span className="text-[1.5rem] font-bold text-credit">—</span>
          ) : (
            [...stats.perToken.entries()].map(([token, v]) => (
              <p key={token} className="figures text-[1.5rem] font-bold text-credit">
                <NumberTicker value={Number(formatUnits(v.locked, 6))} />{" "}
                <span className="text-[0.85rem] font-normal">{tokenSymbol(token)}</span>
              </p>
            ))
          )}
        </div>
        <div className="rounded-[2px] px-[18px] py-4">
          <span className="mb-2 block text-[0.7rem] font-bold tracking-[0.14em] text-ink-muted uppercase">Active streams</span>
          <span className="figures text-[1.5rem] font-bold text-ink">{stats.activeCount}</span>
        </div>
        <div className="rounded-[2px] px-[18px] py-4">
          <span className="mb-2 block text-[0.7rem] font-bold tracking-[0.14em] text-ink-muted uppercase">Streamed this month</span>
          {stats.perToken.size === 0 ? (
            <span className="text-[1.5rem] font-bold text-ink">—</span>
          ) : (
            [...stats.perToken.entries()].map(([token, v]) => (
              <p key={token} className="figures text-[1.5rem] font-bold text-ink">
                {formatUnits(v.streamedThisMonth, 6)} <span className="text-[0.85rem] font-normal">{tokenSymbol(token)}</span>
              </p>
            ))
          )}
        </div>
        <div className="rounded-[2px] px-[18px] py-4">
          <span className="mb-2 block text-[0.7rem] font-bold tracking-[0.14em] text-ink-muted uppercase">Contractors</span>
          <span className="figures text-[1.5rem] font-bold text-ink">{stats.contractorCount}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[2px] border border-rule-strong">
        <table className="w-full min-w-[620px] border-collapse text-left text-[0.88rem]">
          <thead>
            <tr className="border-b-[1.5px] border-ink text-ink-muted">
              <th className="px-4 py-[10px] text-[0.68rem] font-bold tracking-[0.1em] uppercase">ID</th>
              <th className="px-4 py-[10px] text-[0.68rem] font-bold tracking-[0.1em] uppercase">Contractor</th>
              <th className="px-4 py-[10px] text-[0.68rem] font-bold tracking-[0.1em] uppercase">Rate</th>
              <th className="px-4 py-[10px] text-[0.68rem] font-bold tracking-[0.1em] uppercase">Streamed</th>
              <th className="px-4 py-[10px] text-[0.68rem] font-bold tracking-[0.1em] uppercase">Status</th>
              <th className="px-4 py-[10px] text-[0.68rem] font-bold tracking-[0.1em] uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {pending && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-muted">
                  Loading your streams…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-debit">
                  Couldn’t load streams from the RPC: {error instanceof Error ? error.message : String(error)}{" "}
                  <button type="button" onClick={() => refetch()} className="underline hover:no-underline">
                    Retry
                  </button>
                </td>
              </tr>
            )}
            {!pending && !error && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-muted">
                  No streams created from this wallet yet.
                </td>
              </tr>
            )}
            {rows.map((s) => {
              const streamedNow = streamedAsOf(s.totalAmount, s.startTime, s.stopTime, s.cancelled, s.cancelledAt, nowSeconds);
              const monthlyRate = formatUnits(s.ratePerSecond * SECONDS_PER_30_DAYS, 6);
              const status = streamStatus(s.cancelled, s.stopTime, nowSeconds);
              const canCancel = status === "active" || status === "ending-soon";
              const isCancelling = cancellingId === s.streamId.toString();
              return (
                <tr key={s.streamId.toString()} className="border-b border-rule last:border-0 hover:bg-paper">
                  <td className="figures px-4 py-3 text-ink">{s.streamId.toString()}</td>
                  <td className="px-4 py-3 text-ink">
                    <span title={s.recipient}>{truncate(s.recipient)}</span>
                  </td>
                  <td className="figures px-4 py-3 text-ink">
                    {monthlyRate}/mo {tokenSymbol(s.token)}
                  </td>
                  <td className="figures px-4 py-3 text-credit">
                    {formatUnits(streamedNow, 6)} / {formatUnits(s.totalAmount, 6)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3">
                    {canCancel ? (
                      <button
                        type="button"
                        onClick={() => handleCancel(s.streamId)}
                        disabled={isCancelling}
                        className="figures text-[0.78rem] text-debit hover:underline disabled:opacity-40"
                      >
                        {isCancelling ? "Cancelling…" : "Cancel"}
                      </button>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cancelError && <p className="mt-3 text-sm text-debit">{cancelError}</p>}
      <p className="mt-3 text-xs text-ink-muted">
        Shows streams created from this browser. Created from another device? Open its link directly in the{" "}
        Contractor portal.
      </p>
    </>
  );
}
