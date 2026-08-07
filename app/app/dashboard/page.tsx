"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { CreateStreamForm } from "@/components/CreateStreamForm";
import { BatchUploadForm } from "@/components/BatchUploadForm";
import { StreamsOverview } from "@/components/StreamsOverview";
import { CreationHistory } from "@/components/CreationHistory";
import { Footer } from "@/components/Footer";

type Panel = "none" | "create" | "batch";

export default function DashboardPage() {
  const [panel, setPanel] = useState<Panel>("none");

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[960px] px-[clamp(20px,5vw,56px)] py-14">
        <div>
          <h1 className="text-2xl font-bold text-ink">Business dashboard</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Connect your wallet and create streams that pay contractors by the second. Each
            stream locks the full USDC/EURC amount into the contract up front.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setPanel(panel === "create" ? "none" : "create")}
            className="stamp-btn rounded-[2px] border-[1.5px] border-ink px-[22px] py-3 text-[0.92rem] font-bold tracking-[0.03em] text-ink"
          >
            + Create stream
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "batch" ? "none" : "batch")}
            className="stamp-btn rounded-[2px] border-[1.5px] border-ink px-[22px] py-3 text-[0.92rem] font-bold tracking-[0.03em] text-ink"
          >
            ↑ Upload CSV
          </button>
        </div>

        {panel === "create" && <CreateStreamForm />}
        {panel === "batch" && <BatchUploadForm />}

        <CreationHistory />
        <StreamsOverview />
        <Footer />
      </main>
    </>
  );
}
