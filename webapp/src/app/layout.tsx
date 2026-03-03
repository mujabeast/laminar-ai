import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { OpenAIStatusBanner } from "@/components/openai-status-banner";
import { ProfileStatusBanner } from "@/components/profile-status-banner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Laminar.AI",
  description: "Attention diagnostics and understanding support powered by webcam signals and AI coaching.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <OpenAIStatusBanner />
        <ProfileStatusBanner />
        {children}
        <div className="pointer-events-none px-4 pb-4">
          <div className="mx-auto flex max-w-6xl justify-end">
            <div className="rounded-full border border-slate-200/80 bg-white/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 backdrop-blur">
              IEMpulse
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
