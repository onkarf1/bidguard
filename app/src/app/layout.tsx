import type { Metadata } from "next";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { ChatBot } from "@/components/ChatBot";
import { themeScript } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "BidGuard: live auctions you can trust",
  description:
    "AI agents vet every listing, every bid is backed by a deposit, and escrow makes sure the seller ships. Live auctions on Solana.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <Providers>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
            Bids are backed by on-chain deposits and payments sit in escrow: BidGuard never holds your money. Testnet prototype on Solana devnet.
          </footer>
          <ChatBot />
        </Providers>
      </body>
    </html>
  );
}
