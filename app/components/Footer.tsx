export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`mt-16 flex flex-wrap justify-between gap-4 border-t border-rule-strong pt-5 text-[0.78rem] text-ink-muted ${className}`}
    >
      <span>PayU — Programmable Treasury on Arc</span>
      <span>Powered by Arc</span>
    </footer>
  );
}
