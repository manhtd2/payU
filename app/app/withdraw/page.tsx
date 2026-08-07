import { Suspense } from "react";
import { Header } from "@/components/Header";
import { WithdrawPortal } from "@/components/WithdrawPortal";
import { HowItWorksCard } from "@/components/HowItWorksCard";
import { Footer } from "@/components/Footer";

export default function WithdrawPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[960px] px-[clamp(20px,5vw,56px)] py-14">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="flex w-full flex-col gap-6 lg:max-w-2xl">
            <div>
              <h1 className="text-2xl font-bold text-ink">Withdraw Portal</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Connect your wallet and enter a Stream ID to see what’s streamed and withdraw it —
                directly, or gaslessly through the relayer.
              </p>
            </div>
            <Suspense>
              <WithdrawPortal />
            </Suspense>
          </div>
          <div className="w-full lg:max-w-xs lg:pt-16">
            <HowItWorksCard />
          </div>
        </div>
        <Footer />
      </main>
    </>
  );
}
