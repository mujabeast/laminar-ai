"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProfileRequired } from "@/components/profile-required";
import {
  STORAGE_KEYS,
  type StudyGuardStyle,
  type StudyMode,
  type StudySetup,
  calculateDailyStreak,
  getBadgeLabel,
  getGuardStyleLabel,
  isStudySetupLike,
  normalizeFocusDomain,
  normalizeGuardStyle,
  normalizeStudyMode,
  setStoredJson,
  startFreshStudyRun,
  useCurrentProfile,
  useStoredJson,
} from "@/lib/studyos";
import { type AttentionReportRecord, isAttentionReportRecordLike } from "@/lib/telemetry";

const DEFAULT_FORM = {
  studentName: "",
  moduleName: "",
  topic: "",
  studyMode: "video-lecture" as StudyMode,
  focusDomain: "",
  guardStyle: "noob" as StudyGuardStyle,
};

const STUDY_MODE_OPTIONS: Array<{
  value: StudyMode;
  title: string;
  copy: string;
  focusLabel: string;
  focusPlaceholder: string;
}> = [
  {
    value: "video-lecture",
    title: "Video Lecture",
    copy: "For recorded lectures, walkthroughs, or explanation-heavy videos.",
    focusLabel: "Lecture site or source (optional)",
    focusPlaceholder: "ntulearn.ntu.edu.sg or YouTube",
  },
  {
    value: "reading-notes",
    title: "Reading/Notes",
    copy: "For physical notes, PDFs, slides, or textbook reading blocks.",
    focusLabel: "Reading source (optional)",
    focusPlaceholder: "Physical notes, textbook chapter, PDF title",
  },
  {
    value: "active-recall-quiz",
    title: "Active Recall/Quiz",
    copy: "For flashcards, self-testing, MCQs, and retrieval-heavy study blocks.",
    focusLabel: "Quiz platform or material (optional)",
    focusPlaceholder: "Anki, quiz sheet, past MCQ bank",
  },
  {
    value: "problem-solving",
    title: "Problem Solving",
    copy: "For calculations, tutorial sheets, coding tasks, or worked examples.",
    focusLabel: "Problem set source (optional)",
    focusPlaceholder: "Tutorial sheet 4, LeetCode, lab worksheet",
  },
];

const GUARD_OPTIONS: Array<{
  value: StudyGuardStyle;
  title: string;
  copy: string;
}> = [
  {
    value: "noob",
    title: "Noob mode",
    copy: "No alarms at all. Laminar.AI simply records telemetry and screen context so you can review the diagnostic later.",
  },
  {
    value: "casual",
    title: "Casual mode",
    copy: "A moderate alarm mode. Laminar.AI only warns if a phone stays visible across 3 detections, if the face leaves frame for more than 5 seconds, or if the eyes stay fully closed for more than 5 seconds.",
  },
  {
    value: "lock-in",
    title: "Lock in mode",
    copy: "A high-sensitivity guard. One phone appearance is enough to trigger the alarm, and the face or fully closed eyes cannot stay gone for more than 2 seconds.",
  },
];

export default function FocusPlannerPage() {
  const router = useRouter();
  const currentProfile = useCurrentProfile();
  const currentSetup = useStoredJson<StudySetup | null>(
    STORAGE_KEYS.studySetupCurrent,
    null,
    (value): value is StudySetup | null => value === null || isStudySetupLike(value)
  );
  const reportHistory = useStoredJson<AttentionReportRecord[]>(
    STORAGE_KEYS.reportHistory,
    [],
    (value): value is AttentionReportRecord[] =>
      Array.isArray(value) && value.every((entry) => isAttentionReportRecordLike(entry))
  );
  const streak = calculateDailyStreak(reportHistory);

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before starting a focus plan."
        description="Study plans, runs, and dashboards are stored per person on this browser."
      />
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="panel flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="text-2xl font-semibold text-slate-950">Focus Site</h1>
          </div>
          <nav className="flex flex-wrap gap-3">
            <Link className="button-secondary" href="/">
              Home
            </Link>
            <Link className="button-secondary" href="/dashboard">
              Dashboard
            </Link>
            <Link className="button-secondary" href="/understanding">
              Understanding Coach
            </Link>
          </nav>
        </header>

        <section className="panel overflow-hidden">
          <div className="rounded-[2rem] bg-[radial-gradient(circle_at_top_left,rgba(15,61,62,0.16),rgba(255,255,255,0)_42%),linear-gradient(135deg,rgba(255,255,255,0.94),rgba(241,245,249,0.86))] px-6 py-8 md:px-10 md:py-10">
            <p className="eyebrow">Laminar.AI Focus Flow</p>
            <h2 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
              Choose the study mode, define the material, and let Laminar.AI watch how the focus actually evolves.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-700 md:text-lg">
              Laminar.AI now works across lectures, reading, quizzes, and problem solving. The setup below tells the
              diagnostic how to interpret the session, while the guard style decides how aggressively the app should
              interrupt you during the study block.
            </p>
          </div>
        </section>

        <section className="panel space-y-4">
          <div>
            <p className="eyebrow">Workflow</p>
            <h2 className="text-2xl font-semibold text-slate-950">Suggested routine</h2>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Pick the study mode that matches the block you are about to do.</li>
            <li>Choose how strict Laminar.AI should be while the session is running.</li>
            <li>Run the webcam session while working through the material.</li>
            <li>Share the study screen if you want event-to-topic correlation in the report.</li>
            <li>Review the dashboard and history pages for fatigue, posture drift, and recurring weak spots.</li>
          </ol>
        </section>

        <section className="panel space-y-6">
          <div className="space-y-3">
            <p className="eyebrow">Focus Flow</p>
            <h2 className="text-3xl font-semibold text-slate-950">Set up the next study run.</h2>
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
                  Casual and lock-in modes reward cleaner, steadier sessions. Noob mode records a baseline without alarms.
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Save a plan to make the dashboard mode-aware and guard-aware.
            </p>
          )}
        </section>
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
  const [studyMode, setStudyMode] = useState<StudyMode>(normalizeStudyMode(initialSetup?.studyMode));
  const [focusDomain, setFocusDomain] = useState(initialSetup?.focusDomain ?? DEFAULT_FORM.focusDomain);
  const [guardStyle, setGuardStyle] = useState<StudyGuardStyle>(
    normalizeGuardStyle(initialSetup?.guardStyle)
  );
  const [status, setStatus] = useState("");

  const activeMode =
    STUDY_MODE_OPTIONS.find((option) => option.value === studyMode) ?? STUDY_MODE_OPTIONS[0];

  function buildSetup() {
    return {
      id: initialSetup?.id ?? crypto.randomUUID(),
      studentName: studentName.trim(),
      moduleName: moduleName.trim(),
      topic: topic.trim(),
      studyMode: normalizeStudyMode(studyMode),
      focusDomain: normalizeFocusDomain(focusDomain),
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

      <div className="space-y-3">
        <div className="text-sm font-medium text-slate-700">Study mode</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STUDY_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStudyMode(option.value)}
              className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                studyMode === option.value
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

      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <Field label="Topic or target task">
          <input
            className="input-field"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Laplace transforms tutorial sheet"
          />
        </Field>
        <Field label={activeMode.focusLabel}>
          <input
            className="input-field"
            value={focusDomain}
            onChange={(event) => setFocusDomain(event.target.value)}
            placeholder={activeMode.focusPlaceholder}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium text-slate-700">Guard style</div>
        <div className="grid gap-3 md:grid-cols-3">
          {GUARD_OPTIONS.map((option) => (
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
          {studentName || "The student"} is studying {moduleName || "their module"} and will focus on{" "}
          {topic || "a study block"} in {activeMode.title.toLowerCase()} mode. Guard style:{" "}
          {getGuardStyleLabel(guardStyle)}.
          {normalizeFocusDomain(focusDomain)
            ? ` Study source: ${normalizeFocusDomain(focusDomain)}.`
            : " No fixed site is required for this setup."}
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
  const modeLabel =
    STUDY_MODE_OPTIONS.find((option) => option.value === setup.studyMode)?.title ?? "Study mode";

  return (
    <div className="space-y-2 rounded-[1.75rem] border border-slate-200 bg-white/75 p-4">
      <div className="text-sm text-slate-600">{`${setup.moduleName} / ${setup.topic}`}</div>
      <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div>Study mode: {modeLabel}</div>
        <div>Guard style: {getGuardStyleLabel(setup.guardStyle)}</div>
        <div>Study source: {setup.focusDomain || "Not specified"}</div>
      </div>
    </div>
  );
}
