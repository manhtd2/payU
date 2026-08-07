/** The mock's page rhythm: each section is introduced by a heading + hairline rule sitting
 * directly on the paper, separate from whatever bordered/filled block follows it — not a
 * heading printed inside that block's own card. */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-16 mb-6 flex items-baseline gap-[14px] first:mt-0">
      <h2 className="text-[1.3rem] font-bold text-ink">{children}</h2>
      <div className="h-px flex-1 bg-ink opacity-50" />
      {action}
    </div>
  );
}
