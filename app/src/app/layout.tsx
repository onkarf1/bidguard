import type { Metadata } from "next";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "TrustLink — escrow links for freelancers & social sellers",
  description:
    "Get paid safely. Share a payment link, the buyer's USDC is locked in a Solana escrow, and it's released when the work is delivered. Disputes are settled by an AI arbitrator.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <Providers>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-slate-500">
            Funds are held by an on-chain program, never by TrustLink. Built on Solana.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
