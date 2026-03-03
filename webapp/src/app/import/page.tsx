"use client";

import Link from "next/link";

import { ProfileRequired } from "@/components/profile-required";
import { ExtensionImportPanel } from "@/components/extension-import-panel";
import { useCurrentProfile } from "@/lib/studyos";

export default function ImportPage() {
  const currentProfile = useCurrentProfile();

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before importing extension data."
        description="Imported screen behavior is now stored per person."
      />
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto flex min-h-[80vh] max-w-4xl items-center justify-center">
        <div className="w-full space-y-6">
          <header className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="section-title">Upload The Extension JSON</h1>
            <p className="section-copy mt-3">
              The webcam session is done. Upload the exported extension JSON now, then Laminar.AI
              will bring you straight to the Attention Dashboard.
            </p>
          </header>

          <div className="mx-auto max-w-2xl">
            <ExtensionImportPanel
              eyebrow="Final step"
              title="Drop in the exported extension file"
              description="Stop the extension recording, export the JSON, and upload it here. After a successful import, you will be redirected automatically."
              redirectTo="/dashboard"
            />
          </div>

          <div className="mx-auto flex max-w-2xl justify-center gap-3">
            <Link className="button-secondary" href="/history">
              History
            </Link>
            <Link className="button-secondary" href="/dashboard">
              Attention Dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
