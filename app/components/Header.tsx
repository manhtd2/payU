"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Business dashboard" },
  { href: "/withdraw", label: "Contractor portal" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header>
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-6 border-b-2 border-ink px-[clamp(20px,5vw,56px)] pt-7 pb-[22px]">
        <Link href="/" className="text-2xl font-bold tracking-[0.02em] text-ink">
          {/* The status dot sits at the P's own top-left corner, not floating beside the whole
              wordmark — it's a status badge on the letter, like an "online" dot on an avatar. */}
          <span className="relative inline-block">
            <span aria-hidden className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-credit" />
            P
          </span>
          ayU
        </Link>

        <nav className="flex items-center gap-7 text-[0.92rem]">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`border-b pb-[3px] text-ink transition-colors ${
                  active ? "border-ink" : "border-transparent hover:border-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
            if (!mounted) return <div className="h-8 w-32" aria-hidden />;

            if (!account || !chain) {
              return (
                <button
                  type="button"
                  onClick={openConnectModal}
                  className="stamp-btn rounded-[2px] border-[1.5px] border-credit bg-credit px-[22px] py-3 text-[0.92rem] font-bold tracking-[0.03em] text-paper"
                >
                  Connect wallet
                </button>
              );
            }

            return (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openChainModal}
                  className="figures flex items-center gap-1.5 rounded-[2px] border border-rule-strong bg-paper-panel px-2.5 py-[5px] text-[0.8rem] text-ink-muted"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-credit" />
                  {chain.name}
                </button>
                <button
                  type="button"
                  onClick={openAccountModal}
                  className="figures rounded-[2px] border border-rule-strong bg-paper-panel px-2.5 py-[5px] text-[0.8rem] text-ink-muted"
                >
                  {account.displayBalance ? `${account.displayBalance} · ` : ""}
                  {account.displayName}
                </button>
              </div>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </header>
  );
}
