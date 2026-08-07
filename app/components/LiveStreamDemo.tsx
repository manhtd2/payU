"use client";

import { useEffect, useState } from "react";
import { NumberTicker } from "@/components/NumberTicker";

const DEMO_MONTHLY_RATE = 5000;
const DEMO_RATE_PER_SECOND = DEMO_MONTHLY_RATE / (30 * 86_400);
const DEMO_START_OFFSET_SECONDS = 4 * 3600 + 12 * 60; // pretend it's been running a few hours

/** Purely presentational — ticks a synthetic balance upward client-side so a first-time visitor
 * sees the product's actual promise (money arriving every second) instead of reading a sentence
 * about it. No wallet, no RPC, no real transaction; labeled as an example beneath it. */
export function LiveStreamDemo() {
  const [elapsedSeconds, setElapsedSeconds] = useState(DEMO_START_OFFSET_SECONDS);

  useEffect(() => {
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const streamed = elapsedSeconds * DEMO_RATE_PER_SECOND;

  return (
    <div className="relative w-full rounded-[2px] bg-paper-panel px-6 py-[22px] sm:min-w-[360px]">
      <span className="absolute -top-[10px] left-[18px] -rotate-2 rounded-[2px] bg-credit px-2 py-[3px] text-[0.62rem] font-bold tracking-[0.12em] text-paper">
        LIVE ENTRY
      </span>

      <div className="mb-[14px] flex items-center justify-between text-[0.85rem] text-ink-muted">
        <span>Studio LLC → Alex</span>
        <span className="flex items-center gap-1.5 font-bold text-credit">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-credit" />
          Streaming
        </span>
      </div>

      <p className="mb-1 text-[0.7rem] font-bold tracking-[0.14em] text-ink-muted uppercase">Streamed so far</p>
      <p className="figures text-[2.4rem] font-bold text-credit">
        $<NumberTicker value={streamed} decimals={4} fractionClassName="text-[1.3rem]" />
      </p>
      <p className="figures mt-1 text-[0.78rem] text-ink-muted">
        ${DEMO_MONTHLY_RATE.toLocaleString("en-US")}/mo · withdrawable any second
      </p>
    </div>
  );
}
