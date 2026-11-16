import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import AppWalletProvider from "@/components/WalletProvider";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Bounty Board · Solana",
  description: "Mid-level Solana escrow bounty board on Devnet",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} font-[family-name:var(--font-body)] antialiased`}>
        <AppWalletProvider>{children}</AppWalletProvider>
      </body>
    </html>
  );
}
