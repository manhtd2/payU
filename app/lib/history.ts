export interface CreationRecord {
  id: string;
  createdAt: number; // ms epoch, client clock — display only
  kind: "single" | "batch";
  tokenSymbol: string;
  recipients: string[];
  totalAmount: string; // human-readable (already formatted, e.g. "1000.0")
  txHashes: string[]; // one entry for a single stream, one per chunk for a batch
  streamIds: string[]; // index-aligned with `recipients`; string since JSON can't hold bigint
}

export const CREATION_EVENT = "payu:stream-created";

// In-memory cache so repeated snapshot reads (as required by useSyncExternalStore) return the
// same array reference until a write actually happens, instead of re-parsing localStorage — and
// a new, unequal reference — on every render.
const cache = new Map<string, CreationRecord[]>();

function storageKey(address: string): string {
  return `payu:creation-history:${address.toLowerCase()}`;
}

function readFromStorage(address: string): CreationRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CreationRecord[];
    // Records written before `streamIds` existed won't have it — backfill so callers can rely on it.
    return parsed
      .map((r) => ({ ...r, streamIds: r.streamIds ?? [] }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function getCreationHistorySnapshot(address: string): CreationRecord[] {
  const key = address.toLowerCase();
  if (!cache.has(key)) {
    cache.set(key, readFromStorage(address));
  }
  return cache.get(key)!;
}

export function appendCreationHistory(address: string, record: CreationRecord): void {
  if (typeof window === "undefined") return;
  const key = address.toLowerCase();
  const existing = getCreationHistorySnapshot(address);
  const next = [record, ...existing].slice(0, 100); // cap so storage doesn't grow unbounded
  window.localStorage.setItem(storageKey(address), JSON.stringify(next));
  cache.set(key, next);
  window.dispatchEvent(new Event(CREATION_EVENT));
}
