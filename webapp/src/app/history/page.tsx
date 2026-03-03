"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import { ProfileRequired } from "@/components/profile-required";
import {
  STORAGE_KEYS,
  type AttentionReportRecord,
  type ExtensionHistoryEntry,
  type ExtensionSession,
  type WebcamSession,
  calculateDailyStreak,
  countLookAwaySpikes,
  formatMinutesSeconds,
  isExtensionSessionLike,
  isSampleAttentive,
  pct,
  removeStoredValue,
  useCurrentProfile,
  useStoredJson,
} from "@/lib/studyos";

export default function HistoryPage() {
  const currentProfile = useCurrentProfile();
  const webcamHistory = useStoredJson<WebcamSession[]>(
    STORAGE_KEYS.attentionHistory,
    [],
    Array.isArray
  );
  const extensionHistory = useStoredJson<ExtensionHistoryEntry[]>(
    STORAGE_KEYS.extensionHistory,
    [],
    Array.isArray
  );
  const extensionLast = useStoredJson<ExtensionSession | null>(
    STORAGE_KEYS.extensionLast,
    null,
    (value): value is ExtensionSession | null => value === null || isExtensionSessionLike(value)
  );
  const reportHistory = useStoredJson<AttentionReportRecord[]>(
    STORAGE_KEYS.reportHistory,
    [],
    Array.isArray
  );

  const streak = calculateDailyStreak(reportHistory);
  const latestReport = reportHistory[0] ?? null;

  const webcamCards = useMemo(
    () =>
      webcamHistory.map((entry, index) => {
        const attention = entry.samples.length
          ? entry.samples.filter(isSampleAttentive).length / entry.samples.length
          : 0;

        return {
          id: `${entry.sessionId}-${index}`,
          createdAtLabel: entry.createdAt
            ? new Date(entry.createdAt).toLocaleString()
            : "Unknown time",
          durationLabel: formatMinutesSeconds(entry.totalSeconds),
          attentionLabel: pct(attention),
          spikes: countLookAwaySpikes(entry.samples ?? []),
          topic: entry.setupSnapshot?.topic || "Study session",
        };
      }),
    [webcamHistory]
  );

  const extensionCards = useMemo(
    () =>
      extensionHistory.map((entry, index) => ({
        id: `${entry.importedAt ?? "extension"}-${index}`,
        filename: entry.filename || "Unknown file",
        importedAtLabel: entry.importedAt
          ? new Date(entry.importedAt).toLocaleString()
          : "Unknown import time",
        spans: entry.tabSpans?.length ?? 0,
        events: entry.tabEvents?.length ?? 0,
        confusionCount: entry.confusionCaptures?.length ?? 0,
      })),
    [extensionHistory]
  );

  const confusionCaptures = useMemo(() => {
    const fromLast = (extensionLast?.confusionCaptures ?? [])
      .filter((capture) => Boolean(capture.screenshotDataUrl))
      .map((capture) => ({
        ...capture,
        filename: "Current import",
      }));
    const fromHistory = extensionHistory.flatMap((entry) =>
      (entry.confusionCaptures ?? [])
        .filter((capture) => Boolean(capture.screenshotDataUrl))
        .map((capture) => ({
          ...capture,
          filename: entry.filename,
        }))
    );

    return [...fromLast, ...fromHistory]
      .filter(
        (capture, index, list) =>
          list.findIndex((candidate) => candidate.id === capture.id) === index
      )
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 9);
  }, [extensionHistory, extensionLast]);

  function clearWebcamHistory() {
    removeStoredValue(STORAGE_KEYS.attentionHistory);
    removeStoredValue(STORAGE_KEYS.attentionLast);
  }

  function clearExtensionHistory() {
    removeStoredValue(STORAGE_KEYS.extensionHistory);
    removeStoredValue(STORAGE_KEYS.extensionLast);
  }

  function clearReportHistory() {
    removeStoredValue(STORAGE_KEYS.reportHistory);
  }

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before opening history."
        description="Saved reports, imports, and captures are now stored per person."
      />
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="panel flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="section-title">History</h1>
            <p className="section-copy">
              This page stores past attention reports, recent confusion captures, webcam logs, and
              extension logs.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button-secondary" href="/focus">
              New Session
            </Link>
            <Link className="button-secondary" href="/dashboard">
              Attention Dashboard
            </Link>
            <Link className="button-secondary" href="/academic">
              Academic Dashboard
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatPanel label="Saved reports" value={String(reportHistory.length)} hint="attention sessions" />
          <StatPanel label="Current streak" value={String(streak)} hint="successful day(s)" />
          <StatPanel
            label="Latest score"
            value={latestReport ? String(latestReport.score) : "-"}
            hint={latestReport ? latestReport.fusionMode : "no report yet"}
          />
          <StatPanel
            label="Confusion captures"
            value={String(confusionCaptures.length)}
            hint="recent saved screenshots"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="panel space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">Reports</p>
                <h2 className="text-xl font-semibold text-slate-950">Saved attention reports</h2>
              </div>
              <button className="button-secondary" onClick={clearReportHistory} type="button">
                Clear
              </button>
            </div>
            {reportHistory.length === 0 ? (
              <p className="text-sm text-slate-600">No saved reports yet.</p>
            ) : (
              <div className="space-y-3">
                {reportHistory.slice(0, 8).map((report) => (
                  <div
                    key={report.id}
                    className="rounded-[1.5rem] border border-slate-200 bg-white/80 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">
                          {report.moduleName} · {report.topic}
                        </div>
                        <div className="text-sm text-slate-500">
                          {new Date(report.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          report.goalAchieved
                            ? "bg-emerald-50 text-emerald-900"
                            : "bg-slate-950/5 text-slate-700"
                        }`}
                      >
                        {report.goalAchieved ? report.badgeLabel : "Goals incomplete"}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                      <div>Score: {report.score}</div>
                      <div>Attention: {pct(report.attentionRate)}</div>
                      <div>Duration: {formatMinutesSeconds(report.totalSeconds)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">Do not understand</p>
                <h2 className="text-xl font-semibold text-slate-950">Recent confusion captures</h2>
              </div>
              <button className="button-secondary" onClick={clearExtensionHistory} type="button">
                Clear imports
              </button>
            </div>
            {confusionCaptures.length === 0 ? (
              <p className="text-sm text-slate-600">
                Use the extension button when the student gets stuck to save a screenshot here.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {confusionCaptures.map((capture) => (
                  <div
                    key={`${capture.filename}-${capture.id}`}
                    className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white/85"
                  >
                    {capture.screenshotDataUrl ? (
                      <Image
                        alt={capture.title || "Confusion capture"}
                        className="aspect-video w-full object-cover"
                        height={360}
                        src={capture.screenshotDataUrl}
                        unoptimized
                        width={640}
                      />
                    ) : (
                      <div className="flex aspect-video items-center justify-center bg-slate-950/5 px-4 text-center text-sm text-slate-500">
                        Preview omitted locally to stay within browser storage limits.
                      </div>
                    )}
                    <div className="space-y-1 px-4 py-3 text-sm">
                      <div className="font-medium text-slate-900">
                        {capture.title || capture.domain || "Captured screen"}
                      </div>
                      <div className="text-slate-600">{new Date(capture.ts).toLocaleString()}</div>
                      <div className="truncate text-slate-500">{capture.filename}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="panel space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">Webcam</p>
                <h2 className="text-xl font-semibold text-slate-950">Attention sessions</h2>
              </div>
              <button className="button-secondary" onClick={clearWebcamHistory} type="button">
                Clear
              </button>
            </div>
            {webcamCards.length === 0 ? (
              <p className="text-sm text-slate-600">No webcam sessions saved yet.</p>
            ) : (
              <div className="space-y-2">
                {webcamCards.map((card) => (
                  <div key={card.id} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                    <div className="font-medium text-slate-900">{card.topic}</div>
                    <div className="mt-1 text-slate-600">{card.createdAtLabel}</div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-slate-700">
                      <span>{card.durationLabel}</span>
                      <span>{card.attentionLabel} attention</span>
                      <span>{card.spikes} spikes</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel space-y-4">
            <div>
              <p className="eyebrow">Extension</p>
              <h2 className="text-xl font-semibold text-slate-950">Imported screen sessions</h2>
            </div>
            {extensionCards.length === 0 ? (
              <p className="text-sm text-slate-600">No extension imports saved yet.</p>
            ) : (
              <div className="space-y-2">
                {extensionCards.map((card) => (
                  <div key={card.id} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                    <div className="font-medium text-slate-900">{card.filename}</div>
                    <div className="mt-1 text-slate-600">{card.importedAtLabel}</div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-slate-600">
                      <span>{card.spans} tab spans</span>
                      <span>{card.events} tab events</span>
                      <span>{card.confusionCount} confusion captures</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatPanel({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="panel space-y-2">
      <div className="text-sm font-medium text-slate-600">{label}</div>
      <div className="text-5xl font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="text-sm text-slate-500">{hint}</div>
    </div>
  );
}
