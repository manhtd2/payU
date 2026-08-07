"use client";

import { useEffect, useRef, useState } from "react";

/** Purely presentational — tweens the displayed number from its previous value to `value`
 * whenever `value` changes. No effect on the underlying data or business logic. */
export function NumberTicker({
  value,
  decimals = 2,
  className,
  fractionClassName,
}: {
  value: number;
  decimals?: number;
  className?: string;
  /** When set, the fractional part (including the leading ".") renders in its own span with
   * this class instead of inline with the whole-number part — e.g. a smaller size, so "29" reads
   * as the headline figure and ".1833" as a quieter trailing detail. */
  fractionClassName?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const duration = 600;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  // Fixed "en-US" (not the browser's locale) so the decimal separator always matches the rest
  // of the app's number formatting (formatUnits, parseUnits) — a viewer with a comma-decimal
  // locale would otherwise see "0,35" here next to "0.349538" a few lines below.
  const formatted = display.toFixed(decimals);

  if (!fractionClassName) {
    return <span className={className}>{formatted}</span>;
  }

  const dotIndex = formatted.indexOf(".");
  if (dotIndex === -1) return <span className={className}>{formatted}</span>;

  return (
    <span className={className}>
      {formatted.slice(0, dotIndex)}
      <span className={fractionClassName}>{formatted.slice(dotIndex)}</span>
    </span>
  );
}
