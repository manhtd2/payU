const STEPS = [
  { title: "Enter the stream ID", desc: "Paste the ID your business sent you, or open the link they shared." },
  { title: "Watch the balance stream in", desc: "The withdrawable amount ticks up every second, computed client-side." },
  { title: "Withdraw, with or without gas", desc: "Pay your own gas, or sign an authorization and let the relayer cover it." },
];

/** Purely presentational explainer card — no wallet/contract state, static copy only. The
 * numbering is earned here: it's a real sequence the reader follows, not decoration. */
export function HowItWorksCard() {
  return (
    <div className="flex flex-col gap-4 rounded-[2px] bg-paper-panel p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink">What happens</h2>
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex items-start gap-3">
            <span className="figures flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rule-strong text-xs font-bold text-ink">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-bold text-ink">{step.title}</p>
              <p className="text-xs text-ink-muted">{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
