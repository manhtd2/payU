import Link from "next/link";
import { Header } from "@/components/Header";
import { LiveStreamDemo } from "@/components/LiveStreamDemo";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto grid w-full max-w-[960px] grid-cols-1 items-center gap-12 px-[clamp(20px,5vw,56px)] pt-14 pb-12 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h1 className="text-[clamp(2.1rem,4vw,2.9rem)] font-bold leading-[1.12] text-ink">
            Pay contractors by the second, on Arc.
          </h1>
          <p className="mt-[18px] max-w-[46ch] text-[1.05rem] leading-[1.55] text-ink-muted">
            Open a USDC/EURC stream to a contractor — they withdraw whatever has streamed,
            any time. Near-zero fees because Arc uses USDC as gas, with stable fees and
            sub-second settlement.
          </p>
          <div className="mt-7 flex flex-wrap gap-[14px]">
            <Link
              href="/dashboard"
              className="stamp-btn rounded-[2px] border-[1.5px] border-credit bg-credit px-[22px] py-3 text-[0.92rem] font-bold tracking-[0.03em] text-paper"
            >
              I’m a business
            </Link>
            <Link
              href="/withdraw"
              className="stamp-btn rounded-[2px] border-[1.5px] border-ink px-[22px] py-3 text-[0.92rem] font-bold tracking-[0.03em] text-ink"
            >
              I’m a contractor
            </Link>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2">
          <LiveStreamDemo />
          <p className="px-1 text-xs text-ink-muted/70">Example stream, illustrative — not a real transaction.</p>
        </div>
        <Footer className="md:col-span-2" />
      </main>
    </>
  );
}
