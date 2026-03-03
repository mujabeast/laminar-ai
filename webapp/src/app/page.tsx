"use client";

import Link from "next/link";

import { CompactProfileChooser } from "@/components/profile-chooser";
import { useCurrentProfile } from "@/lib/studyos";

export default function HomePage() {
  const currentProfile = useCurrentProfile();

  if (!currentProfile) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
          <div className="w-full">
            <CompactProfileChooser />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center">
        <section className="panel w-full space-y-6 text-center">
          <div className="space-y-3">
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="section-title">Hey there. What do you need right now?</h1>
            <p className="section-copy mx-auto">Continuing as {currentProfile.name}.</p>
          </div>

          <div className="mx-auto grid w-full max-w-4xl gap-4 md:grid-cols-2">
            <Link
              className="rounded-[1.75rem] border border-[#0f3d3e]/20 bg-[linear-gradient(180deg,rgba(15,61,62,0.12),rgba(15,61,62,0.05))] px-6 py-6 text-left text-slate-900 shadow-sm transition hover:border-[#0f3d3e]/35 hover:bg-[linear-gradient(180deg,rgba(15,61,62,0.16),rgba(15,61,62,0.08))]"
              href="/focus"
            >
              <div className="text-2xl font-semibold">I keep getting distracted</div>
              <div className="mt-2 text-sm text-slate-700">
                Start the focus-planning flow, webcam session, and attention dashboard.
              </div>
            </Link>

            <Link
              className="rounded-[1.75rem] border border-[#c96f3b]/20 bg-[linear-gradient(180deg,rgba(201,111,59,0.16),rgba(201,111,59,0.06))] px-6 py-6 text-left text-slate-900 shadow-sm transition hover:border-[#c96f3b]/35 hover:bg-[linear-gradient(180deg,rgba(201,111,59,0.2),rgba(201,111,59,0.1))]"
              href="/understanding"
            >
              <div className="text-2xl font-semibold">I don&apos;t understand this topic</div>
              <div className="mt-2 text-sm text-slate-700">
                Open the topic intake and coaching flow, then feed weak areas into the academic dashboard.
              </div>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
