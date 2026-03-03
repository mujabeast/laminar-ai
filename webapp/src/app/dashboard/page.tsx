"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  AIVisualGallery,
  type AIVisualCard,
  type AIVisualDataset,
} from "@/components/ai-visual-gallery";
import { ProfileRequired } from "@/components/profile-required";
import {
  STORAGE_KEYS,
  type AttentionReportRecord,
  type ExtensionHistoryEntry,
  type ExtensionSession,
  type ProfileAnalysisRecord,
  type StudyRunRecord,
  type StudySetup,
  type WebcamSession,
  calculateDailyStreak,
  computeFusionMetrics,
  countLookAwaySpikes,
  createAttentionReportRecord,
  formatMinutesSeconds,
  getStoredJson,
  isExtensionSessionLike,
  isSampleAttentive,
  isStudyRunRecordLike,
  isStudySetupLike,
  pct,
  resolveStudyRun,
  setStoredJson,
  syncStudyRunToExtension,
  useCurrentProfile,
  useStoredJson,
} from "@/lib/studyos";

const PATCHES: Record<string, { title: string; steps: string[] }> = {
  "Seat-Leaver": {
    title: "Micro-Patch: Chair Anchor Sprint (8 min)",
    steps: [
      "Before starting: water, charger, and notes within reach.",
      "Stay seated for 8 minutes even if you feel restless.",
      "Take a planned 60-second break after the sprint.",
    ],
  },
  "Split Focus": {
    title: "Micro-Patch: Two-Tab Lock (10 min)",
    steps: [
      "Keep only the lecture and one helper tab open.",
      "If a third tab opens, close one immediately.",
      "Use short planned resets instead of spontaneous tab hopping.",
    ],
  },
  "Late Crasher": {
    title: "Micro-Patch: Split-Run Protocol (6 + 6 min)",
    steps: [
      "Work for 6 focused minutes.",
      "Take a 45-second reset for breathing and posture.",
      "Work for another 6 focused minutes.",
    ],
  },
  "Helper Reliant": {
    title: "Micro-Patch: Helper Quota (8 min)",
    steps: [
      "Attempt the problem alone for one minute before asking for help.",
      "Ask one precise question instead of a broad prompt.",
      "Return to the source and apply the answer for 3 minutes.",
    ],
  },
  "Deep Worker": {
    title: "Micro-Patch: Streak Saver (60 sec)",
    steps: [
      "Write one line about what you just covered.",
      "Write one line about what comes next.",
      "Start another 8-minute sprint.",
    ],
  },
};

type GeneratedVisualBoard = {
  createdAt: number;
  summary: string;
  cards: AIVisualCard[];
  signature: string;
};

export default function DashboardPage() {
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
  const webcamLast = useStoredJson<WebcamSession | null>(STORAGE_KEYS.attentionLast, null);
  const webcamHistory = useStoredJson<WebcamSession[]>(STORAGE_KEYS.attentionHistory, [], Array.isArray);
  const extensionLast = useStoredJson<ExtensionSession | null>(
    STORAGE_KEYS.extensionLast,
    null,
    (value): value is ExtensionSession | null => value === null || isExtensionSessionLike(value)
  );
  const extensionHistory = useStoredJson<ExtensionHistoryEntry[]>(
    STORAGE_KEYS.extensionHistory,
    [],
    Array.isArray
  );
  const reportHistory = useStoredJson<AttentionReportRecord[]>(
    STORAGE_KEYS.reportHistory,
    [],
    Array.isArray
  );
  const aiProfileByRun = useStoredJson<Record<string, ProfileAnalysisRecord>>(
    STORAGE_KEYS.aiProfileByRun,
    {},
    (value): value is Record<string, ProfileAnalysisRecord> =>
      !!value && typeof value === "object" && !Array.isArray(value)
  );

  const [showReport, setShowReport] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [isGeneratingProfile, setIsGeneratingProfile] = useState(false);
  const [visualStatus, setVisualStatus] = useState("");
  const [isGeneratingVisuals, setIsGeneratingVisuals] = useState(false);
  const [attentionVisuals, setAttentionVisuals] = useState<GeneratedVisualBoard | null>(null);

  useEffect(() => {
    if (currentRun) {
      syncStudyRunToExtension(currentRun);
    }
  }, [currentRun]);

  const resolvedRun = useMemo(
    () =>
      resolveStudyRun({
        currentRun,
        currentSetup,
        webcamLast,
        webcamHistory,
        extensionLast,
        extensionHistory,
      }),
    [currentRun, currentSetup, extensionHistory, extensionLast, webcamHistory, webcamLast]
  );

  const studyRunId = resolvedRun.studyRunId;
  const webcam = resolvedRun.webcam;
  const extensionSession = resolvedRun.extensionSession;
  const setup = resolvedRun.setup;
  const profileAnalysis = studyRunId ? aiProfileByRun[studyRunId] ?? null : null;

  const metrics = useMemo(
    () =>
      computeFusionMetrics({
        webcam,
        extensionSession,
        setup,
      }),
    [extensionSession, setup, webcam]
  );

  const reportRecord = useMemo(() => {
    if (!webcam && !extensionSession) return null;
    return createAttentionReportRecord({
      setup,
      webcam,
      extensionSession,
      metrics,
    });
  }, [extensionSession, metrics, setup, webcam]);

  const reportSignature = reportRecord ? JSON.stringify(reportRecord) : "";

  useEffect(() => {
    if (!reportRecord) return;

    const history = getStoredJson<AttentionReportRecord[]>(STORAGE_KEYS.reportHistory, []);
    const existingIndex = history.findIndex((entry) => entry.id === reportRecord.id);

    if (existingIndex >= 0 && JSON.stringify(history[existingIndex]) === reportSignature) {
      return;
    }

    const next = existingIndex >= 0 ? [...history] : [reportRecord, ...history];
    if (existingIndex >= 0) {
      next[existingIndex] = reportRecord;
    }

    next.sort((a, b) => b.createdAt - a.createdAt);
    setStoredJson(STORAGE_KEYS.reportHistory, next.slice(0, 90));
  }, [reportRecord, reportSignature]);

  const streak = calculateDailyStreak(reportHistory);
  const recentHistory = webcamHistory.slice(0, 5);
  const patch = PATCHES[metrics.fusionMode] ?? PATCHES["Deep Worker"];
  const filteredReports = useMemo(
    () =>
      reportHistory
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-10),
    [reportHistory]
  );
  const attentionVisualDatasets = useMemo<AIVisualDataset[]>(() => {
    const datasets: AIVisualDataset[] = [];

    if (filteredReports.length > 0) {
      datasets.push({
        id: "score_trend",
        label: "Focus score trend",
        accent: "#0f3d3e",
        points: filteredReports.map((entry) => ({
          label: new Date(entry.createdAt).toLocaleDateString(),
          value: entry.score,
        })),
      });

      datasets.push({
        id: "attention_trend",
        label: "Attention rate trend",
        accent: "#c96f3b",
        suffix: "%",
        points: filteredReports.map((entry) => ({
          label: new Date(entry.createdAt).toLocaleDateString(),
          value: Math.round(entry.attentionRate * 100),
        })),
      });

      datasets.push({
        id: "duration_trend",
        label: "Study duration trend",
        accent: "#2563eb",
        suffix: "m",
        points: filteredReports.map((entry) => ({
          label: new Date(entry.createdAt).toLocaleDateString(),
          value: Math.round(entry.totalSeconds / 60),
        })),
      });

      const modeCounts = new Map<string, number>();
      for (const report of filteredReports) {
        modeCounts.set(report.fusionMode, (modeCounts.get(report.fusionMode) ?? 0) + 1);
      }

      datasets.push({
        id: "mode_mix",
        label: "Fusion mode mix",
        accent: "#0f3d3e",
        points: [...modeCounts.entries()].map(([label, value], index) => ({
          label,
          value,
          color: ["#0f3d3e", "#d17a44", "#4f7d75", "#1e3a8a", "#b45309", "#7c3aed"][index % 6],
        })),
      });

      const switchPoints = filteredReports
        .filter((entry) => entry.awaySwitches !== null)
        .map((entry) => ({
          label: new Date(entry.createdAt).toLocaleDateString(),
          value: entry.awaySwitches ?? 0,
        }));

      if (switchPoints.length > 0) {
        datasets.push({
          id: "switch_trend",
          label: "Off-focus switch trend",
          accent: "#8b5cf6",
          points: switchPoints,
        });
      }
    }

    if (metrics.timeByType) {
      datasets.push({
        id: "current_time_mix",
        label: "Current run time mix",
        accent: "#0f3d3e",
        suffix: "m",
        points: [
          {
            label: "Study",
            value: metrics.timeByType.study.minutes,
            color: "#0f3d3e",
          },
          {
            label: "Helper",
            value: metrics.timeByType.helper.minutes,
            color: "#4f7d75",
          },
          {
            label: "Sedative",
            value: metrics.timeByType.sedative.minutes,
            color: "#d17a44",
          },
          {
            label: "Other",
            value: metrics.timeByType.other.minutes,
            color: "#94a3b8",
          },
        ],
      });
    }

    return datasets.filter((dataset) => dataset.points.length > 0);
  }, [filteredReports, metrics.timeByType]);
  const attentionVisualSignature = JSON.stringify(
    attentionVisualDatasets.map((dataset) => ({
      id: dataset.id,
      labels: dataset.points.map((point) => point.label),
      values: dataset.points.map((point) => point.value),
    }))
  );
  const attentionVisualsAreFresh = attentionVisuals?.signature === attentionVisualSignature;

  useEffect(() => {
    setAttentionVisuals((current) =>
      current?.signature === attentionVisualSignature ? current : null
    );
  }, [attentionVisualSignature]);

  async function generateStudentProfile() {
    if (!studyRunId || (!webcam && !extensionSession)) return;

    setIsGeneratingProfile(true);
    setProfileStatus("Generating student profile...");

    try {
      const response = await fetch("/api/ai/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studyRunId,
          setup,
          webcam,
          extensionSession,
        }),
      });
      const payload = (await response.json()) as
        | { profile?: ProfileAnalysisRecord; error?: string }
        | undefined;

      if (!response.ok || !payload?.profile) {
        throw new Error(payload?.error || "Profile generation failed.");
      }

      setStoredJson(STORAGE_KEYS.aiProfileByRun, {
        ...aiProfileByRun,
        [studyRunId]: payload.profile,
      });
      setProfileStatus("Student profile saved.");
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "Profile generation failed.");
    } finally {
      setIsGeneratingProfile(false);
    }
  }

  async function generateAttentionVisuals() {
    if (attentionVisualDatasets.length < 2) return;

    setIsGeneratingVisuals(true);
    setVisualStatus("Designing an AI visual board...");

    try {
      const response = await fetch("/api/ai/visuals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "attention",
          controlsLabel: `Using the latest ${filteredReports.length} saved report(s).`,
          pageContext: JSON.stringify({
            currentFusionMode: metrics.fusionMode,
            score: metrics.score,
            attentionRatePct: Math.round(metrics.attention * 100),
            lookAwaySpikes: metrics.lookAwaySpikes,
            awaySwitches: metrics.awaySwitches,
            patch: patch.title,
            profileSummary: profileAnalysis?.summary ?? "",
          }),
          datasets: attentionVisualDatasets.map((dataset) => ({
            id: dataset.id,
            label: dataset.label,
            defaultChartType:
              dataset.id === "mode_mix" || dataset.id === "current_time_mix" ? "donut" : "line",
            supportedChartTypes:
              dataset.id === "mode_mix" || dataset.id === "current_time_mix"
                ? ["donut", "bar"]
                : ["line", "bar"],
            note: dataset.label,
            points: dataset.points.map((point) => ({
              label: point.label,
              value: point.value,
            })),
          })),
        }),
      });
      const payload = (await response.json()) as
        | { createdAt: number; summary: string; cards: AIVisualCard[]; error?: string }
        | { error?: string }
        | undefined;

      if (!response.ok || !payload || !("cards" in payload)) {
        throw new Error(payload?.error || "Visual generation failed.");
      }

      setAttentionVisuals({
        createdAt: payload.createdAt,
        summary: payload.summary,
        cards: payload.cards,
        signature: attentionVisualSignature,
      });
      setVisualStatus("AI visual board updated.");
    } catch (error) {
      setVisualStatus(error instanceof Error ? error.message : "Visual generation failed.");
    } finally {
      setIsGeneratingVisuals(false);
    }
  }

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before opening the attention dashboard."
        description="Attention reports and streaks are now stored per person."
      />
    );
  }

  if (!webcam && !extensionSession) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="panel max-w-xl space-y-4">
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="section-title">Attention Dashboard</h1>
            <p className="section-copy">
              No attention data yet. Save a study plan, run the webcam session, upload the
              extension JSON, and return here to review the session.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="button-primary shadow-[0_12px_28px_rgba(15,61,62,0.14)]" href="/focus">
                New Session
              </Link>
              <Link className="button-secondary" href="/academic">
                Academic Dashboard
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="panel flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="section-title">Attention Dashboard</h1>
            <p className="section-copy">
              This dashboard tracks the student&apos;s focus, study habits, and attention quality for
              the current session.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button-secondary" href="/focus">
              New Session
            </Link>
            <Link className="button-secondary" href="/academic">
              Academic Dashboard
            </Link>
            <Link className="button-secondary" href="/history">
              History
            </Link>
          </div>
        </header>

        {!extensionSession ? (
          <section className="panel flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="eyebrow">Extension import needed</p>
              <h2 className="text-xl font-semibold text-slate-950">Upload the JSON to finish this attention run</h2>
              <p className="mt-2 text-sm text-slate-600">
                The webcam session is already saved. Upload the extension JSON to unlock tab and
                site-switching metrics for this run.
              </p>
            </div>
            <Link className="button-primary shrink-0 shadow-[0_12px_28px_rgba(15,61,62,0.14)]" href="/import">
              Upload JSON
            </Link>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Attention report</p>
                <h2 className="text-xl font-semibold text-slate-950">Readable session summary</h2>
              </div>
              <button
                className="button-primary shadow-[0_12px_28px_rgba(15,61,62,0.14)]"
                onClick={() => setShowReport((value) => !value)}
                type="button"
              >
                {showReport ? "Hide report" : "Generate report"}
              </button>
            </div>
            {showReport && reportRecord ? (
              <div className="rounded-[1.5rem] bg-slate-950/5 p-4 text-sm leading-7 text-slate-700">
                {reportRecord.reportText}
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Generate a readable report that summarizes webcam attention, tab behavior, and the
                current study setup.
              </p>
            )}
          </div>

          <div className="panel space-y-4">
            <div>
              <p className="eyebrow">Recent webcam runs</p>
              <h2 className="text-xl font-semibold text-slate-950">Last 5 sessions</h2>
            </div>
            {recentHistory.length === 0 ? (
              <p className="text-sm text-slate-600">No webcam history yet.</p>
            ) : (
              <div className="space-y-2">
                {recentHistory.map((entry, index) => {
                  const historySamples = entry.samples ?? [];
                  const historyAttention = historySamples.length
                    ? historySamples.filter(isSampleAttentive).length / historySamples.length
                    : 0;
                  const historySpikes = historySamples.length
                    ? countLookAwaySpikes(historySamples, 2000)
                    : 0;

                  return (
                    <div
                      key={`${entry.sessionId}-${index}`}
                      className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="text-sm">
                        <div className="font-medium text-slate-900">
                          {entry.setupSnapshot?.topic || "Study session"}
                        </div>
                        <div className="text-slate-600">{formatMinutesSeconds(entry.totalSeconds)}</div>
                      </div>
                      <div className="text-sm md:text-right">
                        <div className="font-medium text-slate-900">{pct(historyAttention)}</div>
                        <div className="text-slate-600">{historySpikes} spikes</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {setup ? (
          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="panel space-y-3">
              <p className="eyebrow">Student plan</p>
              <h2 className="text-2xl font-semibold text-slate-950">
                {setup.studentName} · {setup.moduleName}
              </h2>
              <p className="text-sm text-slate-700">{setup.topic}</p>
              <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                <GoalPill label="Target timer" value={`${setup.targetMinutes} min`} />
                <GoalPill label="Focus domain" value={setup.focusDomain || "Any study site"} />
                <GoalPill label="Max tab exits" value={String(setup.maxTabSwitches)} />
                <GoalPill label="Max look-away spikes" value={String(setup.maxLookAwaySpikes)} />
              </div>
            </div>

            <div className="panel space-y-3">
              <p className="eyebrow">Badge track</p>
              <div className="text-4xl font-semibold text-slate-950">{streak}</div>
              <div className="text-sm text-slate-600">consecutive successful day(s)</div>
              <div
                className={`rounded-2xl px-4 py-3 text-sm ${
                  metrics.goalEvaluation?.achieved
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-slate-950/5 text-slate-700"
                }`}
              >
                {metrics.goalEvaluation?.achieved
                  ? `${metrics.goalEvaluation.badgeLabel} earned for today.`
                  : "Complete all current goals to extend the streak."}
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Focus Score" value={String(metrics.score)} hint="out of 100" />
          <MetricCard
            label="Webcam Attention"
            value={metrics.samples.length ? pct(metrics.attention) : "-"}
            hint={
              metrics.samples.length
                ? `${metrics.lookAwaySpikes} look-away spikes${metrics.lateCrash ? " | late crash" : ""}`
                : "Run a webcam session"
            }
          />
          <MetricCard
            label="Off-focus switches"
            value={metrics.awaySwitches !== null ? String(metrics.awaySwitches) : "-"}
            hint={
              setup?.focusDomain
                ? `times switched away from ${setup.focusDomain}`
                : "Import extension data to count tab exits"
            }
          />
          <MetricCard
            label="Confusion captures"
            value={String(metrics.confusionCaptures.length)}
            hint="captured for the academic dashboard"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="panel space-y-4">
            <div>
              <p className="eyebrow">Goal status</p>
              <h2 className="text-2xl font-semibold text-slate-950">Did the student hit the plan?</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <GoalStatusCard
                label="Timer"
                met={metrics.goalEvaluation?.durationMet ?? false}
                pending={false}
                detail={`${formatMinutesSeconds(metrics.totalSeconds)} logged`}
              />
              <GoalStatusCard
                label="Face guard"
                met={metrics.goalEvaluation?.faceMet ?? false}
                pending={false}
                detail={`${metrics.lookAwaySpikes} spikes detected`}
              />
              <GoalStatusCard
                label="Tab guard"
                met={metrics.goalEvaluation?.tabMet ?? false}
                pending={metrics.goalEvaluation?.pendingTabData ?? true}
                detail={
                  metrics.goalEvaluation?.pendingTabData
                    ? "waiting for extension import"
                    : `${metrics.awaySwitches ?? 0} exits from lecture site`
                }
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">{metrics.fusionMode}</div>
              <div className="mt-1 text-sm text-slate-600">
                {metrics.tabSpans.length
                  ? `Switch rate: ${metrics.switchRate.toFixed(1)} per 10 minutes`
                  : "Import extension JSON to enable screen behavior signals."}
              </div>
              <div className="mt-3 text-sm text-slate-700">
                {metrics.goalEvaluation?.achieved
                  ? "All configured goals were met. Badge awarded."
                  : "The session is still recorded even when guards are missed, so the student can review the pattern honestly."}
              </div>
            </div>
          </div>

          <div className="panel space-y-3">
            <p className="eyebrow">Action</p>
            <h2 className="text-xl font-semibold text-slate-950">{patch.title}</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              {patch.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </section>

        <section className="panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">AI profile</p>
              <h2 className="text-xl font-semibold text-slate-950">Blended attention pattern</h2>
            </div>
            <button
              className="button-secondary"
              disabled={!studyRunId || (!webcam && !extensionSession) || isGeneratingProfile}
              onClick={generateStudentProfile}
              type="button"
            >
              {isGeneratingProfile ? "Generating..." : "Generate profile"}
            </button>
          </div>
          {profileStatus ? <div className="text-sm text-slate-600">{profileStatus}</div> : null}
          {profileAnalysis ? (
            <div className="space-y-3 rounded-[1.5rem] bg-slate-950/5 p-4 text-sm text-slate-700">
              <div className="text-base font-semibold text-slate-900">
                {profileAnalysis.profileLabel}
              </div>
              <p>{profileAnalysis.summary}</p>
              <p>
                <span className="font-medium text-slate-900">Attention:</span>{" "}
                {profileAnalysis.attentionPattern}
              </p>
              <p>
                <span className="font-medium text-slate-900">Behavior:</span>{" "}
                {profileAnalysis.behaviorPattern}
              </p>
              <p>
                <span className="font-medium text-slate-900">Strengths:</span>{" "}
                {profileAnalysis.strengths.join(", ")}
              </p>
              <p>
                <span className="font-medium text-slate-900">Risks:</span>{" "}
                {profileAnalysis.risks.join(", ")}
              </p>
              <p>
                <span className="font-medium text-slate-900">Next experiment:</span>{" "}
                {profileAnalysis.nextExperiment}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Generate a server-side profile that blends webcam attention with tab and helper
              behavior for this session.
            </p>
          )}
        </section>

        {metrics.timeByType ? (
          <section className="grid gap-4 md:grid-cols-4">
            <TimeCard
              label="Study time"
              minutes={metrics.timeByType.study.minutes}
              seconds={metrics.timeByType.study.seconds}
            />
            <TimeCard
              label="Helper time"
              minutes={metrics.timeByType.helper.minutes}
              seconds={metrics.timeByType.helper.seconds}
            />
            <TimeCard
              label="Sedative time"
              minutes={metrics.timeByType.sedative.minutes}
              seconds={metrics.timeByType.sedative.seconds}
            />
            <TimeCard
              label="Other time"
              minutes={metrics.timeByType.other.minutes}
              seconds={metrics.timeByType.other.seconds}
            />
          </section>
        ) : null}

        {metrics.topDomains ? (
          <section className="panel space-y-4">
            <div>
              <p className="eyebrow">Domains</p>
              <h2 className="text-xl font-semibold text-slate-950">Top tracked domains</h2>
            </div>
            <div className="space-y-2">
              {metrics.topDomains.top.map((entry) => (
                <div
                  key={entry.domain}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"
                >
                  <span className="font-medium text-slate-900">{entry.domain}</span>
                  <span className="text-sm text-slate-600">
                    {entry.minutes} min {entry.seconds} sec
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="panel space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">AI Visual Board</p>
              <h2 className="text-xl font-semibold text-slate-950">Native analytics inside Laminar.AI</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                AI chooses the best chart board from your saved attention history. The visuals stay
                inside the app and use a fixed recent-session window.
              </p>
            </div>
            <button
              className="button-primary shadow-[0_12px_28px_rgba(15,61,62,0.14)]"
              disabled={attentionVisualDatasets.length < 2 || isGeneratingVisuals}
              onClick={generateAttentionVisuals}
              type="button"
            >
              {isGeneratingVisuals
                ? "Designing..."
                : attentionVisualsAreFresh
                  ? "Refresh visual board"
                  : "Generate visual board"}
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-[1.6rem] border border-slate-200 bg-white/78 px-5 py-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Visual Source
              </div>
              <div className="mt-3 text-4xl font-semibold text-slate-950">{filteredReports.length}</div>
              <div className="mt-1 text-sm text-slate-600">recent saved report(s) feeding the AI visuals</div>
              <div className="mt-5 rounded-[1.25rem] bg-slate-950/5 px-4 py-4 text-sm text-slate-700">
                Current mode: <span className="font-semibold text-slate-950">{metrics.fusionMode}</span>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-slate-200 bg-white/78 px-5 py-5">
              {visualStatus ? <div className="mb-4 text-sm text-slate-600">{visualStatus}</div> : null}
              {!attentionVisualsAreFresh || !attentionVisuals ? (
                <p className="text-sm leading-7 text-slate-600">
                  Generate the visual board to let AI decide which attention charts matter most for
                  this student right now. It will use the recent saved-session window and the saved local
                  telemetry already in Laminar.AI.
                </p>
              ) : (
                <AIVisualGallery
                  cards={attentionVisuals.cards}
                  datasets={attentionVisualDatasets}
                  summary={attentionVisuals.summary}
                />
              )}
            </div>
          </div>
        </section>

        <footer className="px-1 text-xs text-slate-500">
          Privacy: webcam video is never uploaded or stored. The extension stores only domains,
          timestamps, and confusion screenshots that the student explicitly captures.
        </footer>
      </div>
    </main>
  );
}

function MetricCard({
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
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <div className="text-5xl font-semibold tracking-tight text-slate-950">{value}</div>
      <p className="text-sm text-slate-500">{hint}</p>
    </div>
  );
}

function TimeCard({
  label,
  minutes,
  seconds,
}: {
  label: string;
  minutes: number;
  seconds: number;
}) {
  return (
    <div className="panel space-y-2">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <div className="text-3xl font-semibold text-slate-950">{minutes} min</div>
      <p className="text-sm text-slate-500">{seconds} sec</p>
    </div>
  );
}

function GoalPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  );
}

function GoalStatusCard({
  label,
  met,
  pending,
  detail,
}: {
  label: string;
  met: boolean;
  pending: boolean;
  detail: string;
}) {
  const tone = pending
    ? "bg-amber-50 text-amber-900 border-amber-200"
    : met
      ? "bg-emerald-50 text-emerald-900 border-emerald-200"
      : "bg-rose-50 text-rose-900 border-rose-200";

  return (
    <div className={`rounded-[1.5rem] border px-4 py-4 ${tone}`}>
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xl font-semibold">
        {pending ? "Pending" : met ? "Met" : "Missed"}
      </div>
      <div className="mt-2 text-sm opacity-80">{detail}</div>
    </div>
  );
}
