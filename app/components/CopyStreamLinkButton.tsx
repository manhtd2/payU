"use client";

import { useState } from "react";

/** Lets the business hand a contractor a direct link to their stream, since the contractor
 * portal has no self-service way to discover a stream ID otherwise. */
export function CopyStreamLinkButton({ streamId }: { streamId: bigint }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/withdraw?streamId=${streamId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the adjacent "Open in contractor
      // portal" link still gives the business a way to grab the URL manually.
    }
  }

  return (
    <button type="button" onClick={handleCopy} className="underline hover:no-underline">
      {copied ? "Link copied!" : "Copy link for contractor"}
    </button>
  );
}
