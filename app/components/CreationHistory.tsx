"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useAccount } from "wagmi";
import { CREATION_EVENT, CreationRecord, getCreationHistorySnapshot } from "@/lib/history";
import { EXPLORER_TX_URL } from "@/lib/contracts";
import { CopyStreamLinkButton } from "@/components/CopyStreamLinkButton";
import { SectionTitle } from "@/components/SectionTitle";

const EMPTY: CreationRecord[] = [];

function subscribe(callback: () => void) {
  window.addEventListener(CREATION_EVENT, callback);
  return () => window.removeEventListener(CREATION_EVENT, callback);
}

function truncate(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatWhen(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CreationHistory() {
  const { address } = useAccount();
  const records = useSyncExternalStore(
    subscribe,
    () => (address ? getCreationHistorySnapshot(address) : EMPTY),
    () => EMPTY
  );

  if (!address) return null;

  return (
    <>
      <SectionTitle>Creation history</SectionTitle>
      <div className="flex flex-col gap-4 rounded-[2px] bg-paper-panel px-7 pt-[26px] pb-7">
      <p className="text-sm text-ink-muted">
        {"A running log of every stream you've created from this wallet, so you can track what went out and when."}
      </p>

      {records.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">
          {"Nothing created yet — use “Create stream” or “Upload CSV” above."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {records.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 py-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-ink">
                    {r.kind === "batch"
                      ? `Batch · ${r.recipients.length} contractor${r.recipients.length === 1 ? "" : "s"}`
                      : `Single · ${truncate(r.recipients[0])}`}
                    <span className="figures text-ink-muted"> · {r.totalAmount} {r.tokenSymbol}</span>
                  </span>
                  <span className="text-xs text-ink-muted">{formatWhen(r.createdAt)}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
                  {r.txHashes.map((hash, i) => (
                    <a
                      key={hash}
                      href={EXPLORER_TX_URL(hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-credit hover:underline"
                    >
                      {r.txHashes.length > 1 ? `tx ${i + 1}` : "view tx"}
                    </a>
                  ))}
                </div>
              </div>

              {r.streamIds.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-[2px] bg-paper p-2 text-xs">
                  {r.streamIds.map((id, i) => (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-ink-muted" title={r.recipients[i]}>
                        {r.recipients[i] ? truncate(r.recipients[i]) : null}
                      </span>
                      <Link href={`/withdraw?streamId=${id}`} className="figures font-bold text-credit hover:underline">
                        ID #{id}
                      </Link>
                      <CopyStreamLinkButton streamId={BigInt(id)} />
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
    </>
  );
}
