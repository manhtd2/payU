export type StreamStatusValue = "active" | "ending-soon" | "completed" | "cancelled";

const ENDING_SOON_WINDOW_SECONDS = 3n * 86400n; // 3 days

export function streamStatus(cancelled: boolean, stopTime: bigint, nowSeconds: bigint): StreamStatusValue {
  if (cancelled) return "cancelled";
  if (nowSeconds >= stopTime) return "completed";
  if (stopTime - nowSeconds <= ENDING_SOON_WINDOW_SECONDS) return "ending-soon";
  return "active";
}

const LABEL: Record<StreamStatusValue, string> = {
  active: "Active",
  "ending-soon": "Ending soon",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Bookkeeping ink convention: credit (green) = money still coming in, debit (red) = stopped/
// reversed, warn (ochre) = a temporal flag, muted ink = closed out. Not decorative color choice.
const TEXT_STYLE: Record<StreamStatusValue, string> = {
  active: "text-credit",
  "ending-soon": "text-warn",
  completed: "text-ink-muted",
  cancelled: "text-debit",
};

export function StatusBadge({ status }: { status: StreamStatusValue }) {
  return (
    <span className={`inline-flex items-center gap-[5px] text-[0.72rem] font-bold tracking-[0.03em] ${TEXT_STYLE[status]}`}>
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {LABEL[status]}
    </span>
  );
}
