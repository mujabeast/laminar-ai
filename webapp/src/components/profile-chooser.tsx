"use client";

import { useState } from "react";

import {
  createOrSwitchProfile,
  setCurrentProfile,
  useCurrentProfile,
  useStoredProfiles,
} from "@/lib/studyos";

export function ProfileChooser() {
  return <ProfileChooserInner compact={false} />;
}

export function CompactProfileChooser() {
  return <ProfileChooserInner compact />;
}

function ProfileChooserInner({ compact }: { compact: boolean }) {
  const profiles = useStoredProfiles();
  const currentProfile = useCurrentProfile();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");

  function submit() {
    try {
      const profile = createOrSwitchProfile(name);
      setStatus(`Using ${profile.name}.`);
      setName("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile selection failed.");
    }
  }

  return (
    <section className={`panel ${compact ? "space-y-3 px-5 py-4" : "space-y-4"}`}>
      <div className="space-y-2">
        <p className="eyebrow">Profile</p>
        <h2 className={`${compact ? "text-lg" : "text-xl"} font-semibold text-slate-950`}>
          {currentProfile ? currentProfile.name : "Choose a profile"}
        </h2>
        <p className={`${compact ? "text-xs" : "text-sm"} text-slate-600`}>
          Laminar.AI stores dashboard data under the current profile on this browser.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className={`input-field ${compact ? "py-3 text-sm" : ""}`}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          value={name}
        />
        <button className={`button-primary ${compact ? "px-5 py-3 text-sm" : ""}`} onClick={submit} type="button">
          Continue
        </button>
      </div>

      {profiles.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              className={`rounded-full border ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} font-medium ${
                currentProfile?.id === profile.id
                  ? "border-[#0f3d3e] bg-[#0f3d3e] text-white"
                  : "border-slate-200 bg-white/80 text-slate-800"
              }`}
              onClick={() => {
                setCurrentProfile(profile.id);
                setStatus(`Using ${profile.name}.`);
              }}
              type="button"
            >
              {profile.name}
            </button>
          ))}
        </div>
      ) : null}

      {currentProfile ? (
        <button
          className={`${compact ? "text-xs" : "text-sm"} font-medium text-slate-600 underline underline-offset-4`}
          onClick={() => {
            setCurrentProfile(null);
            setStatus("Profile cleared for this tab.");
          }}
          type="button"
        >
          Switch later
        </button>
      ) : null}

      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </section>
  );
}
