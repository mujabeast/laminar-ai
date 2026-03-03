"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProfileRequired } from "@/components/profile-required";
import {
  type AttentionReportRecord,
  STORAGE_KEYS,
  type StudyGuardStyle,
  type StudyRunRecord,
  type StudySetup,
  calculateDailyStreak,
  getBadgeLabel,
  isStudyRunRecordLike,
  isStudySetupLike,
  normalizeFocusDomain,
  normalizeGuardStyle,
  startFreshStudyRun,
  setStoredJson,
  syncStudyRunToExtension,
  useCurrentProfile,
  useStoredJson,
} from "@/lib/studyos";

const DEFAULT_FORM = {
  studentName: "",
  moduleName: "",
  topic: "",
  focusDomain: "youtube.com",
  targetMinutes: 120,
  maxTabSwitches: 4,
  maxLookAwaySpikes: 6,
  guardStyle: "noob" as StudyGuardStyle,
};

export default function FocusPlannerPage() {
  const router = useRouter();
  const currentProfile = useCurrentProfile();
  const currentSetup = useStoredJson<StudySetup | null>(
    STORAGE_KEYS.studySetupCurrent,
    null,
    (value): value is StudySetup | null => value === null || isStudySetupLike(value)
  );
  const currentRun = useStoredJson<StudyRunRecord | null>(
    STORAGE_KEYS.studyRunCurrent,
    null,
    (value): value is StudyRunRecord | null => value === null || isStudyRunRecordLike(value)
  );
  const reportHistory = useStoredJson<AttentionReportRecord[]>(
    STORAGE_KEYS.reportHistory,
    [],
    Array.isArray
  );
  const streak = calculateDailyStreak(reportHistory);

  useEffect(() => {
    if (currentRun) {
      syncStudyRunToExtension(currentRun);
    }
  }, [currentRun]);

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before starting a focus plan."
        description="Study plans, runs, and dashboards are now stored per person on this browser."
      />
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel space-y-6">
          <div className="space-y-3">
            <p className="eyebrow">Distraction Flow</p>
            <h1 className="display-title">Plan the session before you open the lecture.</h1>
            <p className="section-copy max-w-3xl">
              Set the student, module, topic, lecture site, timer, and guard rails first. The
              webcam and extension data will then be evaluated against those goals instead of
              producing generic feedback.
            </p>
          </div>

          <LandingForm
            key={currentSetup?.id ?? "new-setup"}
            currentProfileName={currentProfile.name}
            initialSetup={currentSetup}
            onSave={(setup, destination) => {
              setStoredJson(STORAGE_KEYS.studySetupCurrent, setup);
              startFreshStudyRun(setup);
              if (destination === "session") {
                router.push("/session");
              }
            }}
          />
        </section>

        <aside className="space-y-6">
          <section className="panel space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">Current setup</p>
                <h2 className="text-2xl font-semibold text-slate-950">
                  {currentSetup ? currentSetup.studentName || "Unnamed student" : currentProfile.name}
                </h2>
              </div>
              <div className="rounded-full bg-[#0f3d3e] px-4 py-2 text-sm font-semibold text-white">
                {streak} day streak
              </div>
            </div>

            {currentSetup ? (
              <div className="space-y-3 text-sm text-slate-700">
                <SetupSummary setup={currentSetup} />
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="font-medium text-emerald-900">
                    Badge if successful: {getBadgeLabel(currentSetup.guardStyle)}
                  </div>
                  <div className="mt-1 text-emerald-800/80">
                    Meet all active goals after importing the extension session to continue the
                    daily streak.
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Save a plan to turn the dashboard into a goal-driven study tracker.
              </p>
            )}
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="eyebrow">Workflow</p>
              <h2 className="text-2xl font-semibold text-slate-950">Suggested routine</h2>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>Configure the study plan here before starting.</li>
              <li>Run the webcam session while watching the lecture.</li>
              <li>Use the extension to record tab behavior and confusion moments.</li>
              <li>Open the dashboard and upload the extension JSON there.</li>
              <li>Generate the attention report and review the confusion captures later.</li>
            </ol>
            <div className="flex flex-wrap gap-3">
              <Link className="button-secondary" href="/">
                Home
              </Link>
              <Link className="button-secondary" href="/dashboard">
                Dashboard
              </Link>
              <Link className="button-secondary" href="/history">
                History
              </Link>
            </div>
          </section>

          <section className="panel space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0f3d3e]/70">
              Extension
            </div>
            <h2 className="text-2xl font-semibold text-slate-950">Install the Laminar.AI recorder</h2>
            <p className="text-sm leading-7 text-slate-700">
              Needed if you want tab-switch detection, confusion capture, and full attention
              scoring. Without the extension, Laminar.AI only sees the webcam side of the session.
            </p>
            <div className="pt-2">
              <Link
                className="button-primary"
                href="/extension-setup"
              >
                Open setup guide
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function LandingForm({
  currentProfileName,
  initialSetup,
  onSave,
}: {
  currentProfileName: string;
  initialSetup: StudySetup | null;
  onSave: (setup: StudySetup, destination: "stay" | "session") => void;
}) {
  const [studentName, setStudentName] = useState(
    initialSetup?.studentName ?? currentProfileName ?? DEFAULT_FORM.studentName
  );
  const [moduleName, setModuleName] = useState(initialSetup?.moduleName ?? DEFAULT_FORM.moduleName);
  const [topic, setTopic] = useState(initialSetup?.topic ?? DEFAULT_FORM.topic);
  const [focusDomain, setFocusDomain] = useState(initialSetup?.focusDomain ?? DEFAULT_FORM.focusDomain);
  const [targetMinutes, setTargetMinutes] = useState(initialSetup?.targetMinutes ?? DEFAULT_FORM.targetMinutes);
  const [maxTabSwitches, setMaxTabSwitches] = useState(
    initialSetup?.maxTabSwitches ?? DEFAULT_FORM.maxTabSwitches
  );
  const [maxLookAwaySpikes, setMaxLookAwaySpikes] = useState(
    initialSetup?.maxLookAwaySpikes ?? DEFAULT_FORM.maxLookAwaySpikes
  );
  const [guardStyle, setGuardStyle] = useState<StudyGuardStyle>(
    normalizeGuardStyle(initialSetup?.guardStyle)
  );
  const [status, setStatus] = useState("");

  function buildSetup() {
    return {
      id: initialSetup?.id ?? crypto.randomUUID(),
      studentName: studentName.trim(),
      moduleName: moduleName.trim(),
      topic: topic.trim(),
      focusDomain: normalizeFocusDomain(focusDomain),
      targetMinutes: Math.max(1, targetMinutes),
      maxTabSwitches: Math.max(0, maxTabSwitches),
      maxLookAwaySpikes: Math.max(0, maxLookAwaySpikes),
      guardStyle: normalizeGuardStyle(guardStyle),
      createdAt: initialSetup?.createdAt ?? Date.now(),
    } satisfies StudySetup;
  }

  function submit(destination: "stay" | "session") {
    if (!studentName.trim() || !moduleName.trim() || !topic.trim()) {
      setStatus("Student name, module, and topic are required.");
      return;
    }

    const setup = buildSetup();
    onSave(setup, destination);
    setStatus(destination === "session" ? "Plan saved. Opening session..." : "Plan saved.");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Student name">
          <input
            className="input-field"
            value={studentName}
            onChange={(event) => setStudentName(event.target.value)}
            placeholder="Aneesh"
          />
        </Field>
        <Field label="Module">
          <input
            className="input-field"
            value={moduleName}
            onChange={(event) => setModuleName(event.target.value)}
            placeholder="Digital Electronics"
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <Field label="Topic or lecture">
          <input
            className="input-field"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Combinational logic design lecture 5"
          />
        </Field>
        <Field label="Lecture site / focus domain">
          <input
            className="input-field"
            value={focusDomain}
            onChange={(event) => setFocusDomain(event.target.value)}
            placeholder="youtube.com"
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Target minutes">
          <input
            className="input-field"
            min={1}
            type="number"
            value={targetMinutes}
            onChange={(event) => setTargetMinutes(Number(event.target.value))}
          />
        </Field>
        <Field label="Max tab exits">
          <input
            className="input-field"
            min={0}
            type="number"
            value={maxTabSwitches}
            onChange={(event) => setMaxTabSwitches(Number(event.target.value))}
          />
        </Field>
        <Field label="Max look-away spikes">
          <input
            className="input-field"
            min={0}
            type="number"
            value={maxLookAwaySpikes}
            onChange={(event) => setMaxLookAwaySpikes(Number(event.target.value))}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium text-slate-700">Guard style</div>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            {
              value: "noob" as const,
              title: "Noob mode",
              copy: "Normal Laminar.AI behavior with tracking, reports, and no loud alarms.",
            },
            {
              value: "lock-in" as const,
              title: "Lock in mode",
              copy: "If you exceed tab or look-away limits, Laminar.AI will keep blasting an alarm until you return.",
            },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGuardStyle(option.value)}
              className={`rounded-[1.5rem] border px-4 py-4 text-left ${
                guardStyle === option.value
                  ? "border-[#0f3d3e] bg-[#0f3d3e]/10"
                  : "border-slate-200 bg-white/75"
              }`}
            >
              <div className="font-semibold text-slate-900">{option.title}</div>
              <div className="mt-1 text-sm text-slate-600">{option.copy}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-slate-200 bg-slate-950/5 p-5">
        <div className="text-sm font-semibold text-slate-900">Plan preview</div>
        <p className="mt-2 text-sm text-slate-700">
          {studentName || "The student"} is studying {moduleName || "their module"} and plans to
          focus on {topic || "a lecture"} for {Math.max(1, targetMinutes)} minutes. They can
          leave {normalizeFocusDomain(focusDomain) || "the lecture site"} at most{" "}
          {Math.max(0, maxTabSwitches)} times and allow {Math.max(0, maxLookAwaySpikes)} look-away
          spikes.
        </p>
      </div>

      {status ? <div className="text-sm text-slate-700">{status}</div> : null}

      <div className="flex flex-wrap gap-3">
        <button className="button-secondary" type="button" onClick={() => submit("stay")}>
          Save plan
        </button>
        <button className="button-primary" type="button" onClick={() => submit("session")}>
          Save and start session
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <div className="min-h-10 text-sm font-medium text-slate-700">{label}</div>
      {children}
    </label>
  );
}

function SetupSummary({ setup }: { setup: StudySetup }) {
  return (
    <div className="space-y-2 rounded-[1.75rem] border border-slate-200 bg-white/75 p-4">
      <div className="text-sm text-slate-600">
        {setup.moduleName} · {setup.topic}
      </div>
      <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div>Target time: {setup.targetMinutes} min</div>
        <div>Focus domain: {setup.focusDomain || "any"}</div>
        <div>Max tab exits: {setup.maxTabSwitches}</div>
        <div>Max look-away spikes: {setup.maxLookAwaySpikes}</div>
      </div>
    </div>
  );
}
