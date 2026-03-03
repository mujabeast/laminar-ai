"use client";

import Link from "next/link";

import { useCurrentProfile } from "@/lib/studyos";

export function ProfileStatusBanner() {
  const currentProfile = useCurrentProfile();

  return (
    <div className="px-4 pt-4">
      <div className="mx-auto flex max-w-6xl justify-end">
        <div className="inline-flex max-w-full items-center gap-3 rounded-full border border-slate-200/80 bg-white/60 px-4 py-2 text-xs shadow-sm backdrop-blur">
          <span className="font-semibold text-slate-900">
            {currentProfile ? `Profile: ${currentProfile.name}` : "No profile selected"}
          </span>
          <Link className="text-slate-600 underline underline-offset-4" href="/">
            Switch
          </Link>
        </div>
      </div>
    </div>
  );
}
