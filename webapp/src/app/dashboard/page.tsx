"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";

import {
  AIVisualGallery,
  type AIVisualCard,
  type AIVisualDataset,
} from "@/components/ai-visual-gallery";
import { ProfileRequired } from "@/components/profile-required";
import {
  STORAGE_KEYS,
  type StudyRunRecord,
  type StudySetup,
  calculateDailyStreak,
  formatMinutesSeconds,
  getGuardStyleLabel,
  getStoredJson,
  isStudyRunRecordLike,
  isStudySetupLike,
  pct,
  setStoredJson,
  useCurrentProfile,
  useStoredJson,
} from "@/lib/studyos";
import {
  type AttentionReportRecord,
  type EventCorrelation,
  type TopicHotspot,
  type WebcamSession,
  createAttentionReportRecord,
  detectLateCrash,
  isAttentionReportRecordLike,
  isWebcamSessionLike,
} from "@/lib/telemetry";

function downsampleSeries(
  samples: WebcamSession["samples"],
  mapValue: (sample: WebcamSession["samples"][number]) => number,
  buckets = 24
) {
  if (!samples.length) return [];

  const chunkSize = Math.max(1, Math.ceil(samples.length / buckets));
  const points: Array<{ label: string; value: number }> = [];

  for (let index = 0; index < samples.length; index += chunkSize) {
    const chunk = samples.slice(index, index + chunkSize);
    const ts = chunk[Math.floor(chunk.length / 2)]?.ts ?? chunk[0]?.ts ?? Date.now();
    points.push({
      label: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      value: Math.round(
        chunk.reduce((sum, sample) => sum + mapValue(sample), 0) / Math.max(chunk.length, 1)
      ),
    });
  }

  return points;
}

function getModeInterpretation(studyMode: StudySetup["studyMode"] | WebcamSession["studyMode"]) {
  if (studyMode === "reading-notes") {
    return "Reading mode tolerates more downward head angle and sometimes a lower blink rate, so Laminar.AI weighs continuity, posture drift, fatigue, and event-linked text hotspots more heavily than passive-stare cues.";
  }
  if (studyMode === "video-lecture") {
    return "Video-lecture mode treats low blink rate plus drifting head pose as a stronger sign of zoning out, because the student can look present while mentally disengaging.";
  }
  if (studyMode === "active-recall-quiz") {
    return "Active-recall mode accepts brow furrowing and short bursts of strain if the student stays visually anchored and keeps coming back to the task.";
  }
  return "Problem-solving mode expects some confusion and head movement while thinking, so Laminar.AI weighs repeated visibility breaks, phone distraction, and posture collapse more heavily than momentary struggle cues.";
}

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
  const webcamLast = useStoredJson<WebcamSession | null>(
    STORAGE_KEYS.attentionLast,
    null,
    (value): value is WebcamSession | null => value === null || isWebcamSessionLike(value)
  );
  const webcamHistory = useStoredJson<WebcamSession[]>(
    STORAGE_KEYS.attentionHistory,
    [],
    (value): value is WebcamSession[] =>
      Array.isArray(value) && value.every((entry) => isWebcamSessionLike(entry))
  );
  const reportHistory = useStoredJson<AttentionReportRecord[]>(
    STORAGE_KEYS.reportHistory,
    [],
    (value): value is AttentionReportRecord[] =>
      Array.isArray(value) && value.every((entry) => isAttentionReportRecordLike(entry))
  );

  const currentRunId = currentRun?.studyRunId ?? null;
  const webcam =
    !currentRunId
      ? (webcamLast ?? webcamHistory[0] ?? null)
      : ((webcamLast?.studyRunId === currentRunId ? webcamLast : null) ??
        webcamHistory.find((entry) => entry.studyRunId === currentRunId) ??
        webcamLast ??
        webcamHistory[0] ??
        null);

  const setup = webcam?.setupSnapshot ?? currentRun?.setupSnapshot ?? currentSetup;

  const reportRecord = useMemo(
    () => (webcam ? createAttentionReportRecord({ setup, webcam }) : null),
    [setup, webcam]
  );

  useEffect(() => {
    if (!reportRecord) return;

    const history = getStoredJson<AttentionReportRecord[]>(
      STORAGE_KEYS.reportHistory,
      [],
      (value): value is AttentionReportRecord[] =>
        Array.isArray(value) && value.every((entry) => isAttentionReportRecordLike(entry))
    );
    const existingIndex = history.findIndex((entry) => entry.id === reportRecord.id);
    const next = existingIndex >= 0 ? [...history] : [reportRecord, ...history];

    if (existingIndex >= 0) {
      next[existingIndex] = reportRecord;
    }

    next.sort((left, right) => right.createdAt - left.createdAt);
    setStoredJson(STORAGE_KEYS.reportHistory, next.slice(0, 90));
  }, [reportRecord]);

  const streak = calculateDailyStreak(reportHistory);

  const recentReports = useMemo(
    () => reportHistory.slice().sort((left, right) => left.createdAt - right.createdAt).slice(-8),
    [reportHistory]
  );

  const visualBoard = useMemo(() => {
    if (!webcam || !reportRecord) return null;

    const attentionWave = downsampleSeries(webcam.samples, (sample) =>
      sample.attentionLikely ? 100 : 0
    );
    const headDriftWave = downsampleSeries(webcam.samples, (sample) =>
      Math.round(
        Math.max(
          Math.abs(sample.headPose.pitch),
          Math.abs(sample.headPose.yaw),
          Math.abs(sample.headPose.roll)
        )
      )
    );
    const cueMix = [
      {
        label: "PERCLOS",
        value: Math.round(webcam.summary.perclos * 100),
        color: "#0f3d3e",
      },
      {
        label: "Brow Furrow",
        value: Math.round(webcam.summary.browFurrowRate * 100),
        color: "#d17a44",
      },
      {
        label: "Jaw Clench",
        value: Math.round(webcam.summary.jawClenchRate * 100),
        color: "#b45309",
      },
      {
        label: "Slouch",
        value: Math.round(webcam.summary.postureBreakdown.slouchPct * 100),
        color: "#1e3a8a",
      },
      {
        label: "Phone",
        value: Math.round(webcam.summary.phoneDetectionRate * 100),
        color: "#b91c1c",
      },
    ];
    const efficiencyTrend = recentReports.map((entry) => ({
      label: new Date(entry.createdAt).toLocaleDateString(),
      value: entry.score,
    }));

    const datasets: AIVisualDataset[] = [
      {
        id: "attention_wave",
        label: "Attention continuity",
        accent: "#0f3d3e",
        suffix: "%",
        points: attentionWave,
      },
      {
        id: "head_drift_wave",
        label: "Head-pose drift",
        accent: "#c96f3b",
        suffix: " deg",
        points: headDriftWave,
      },
      {
        id: "cue_mix",
        label: "Cue mix",
        accent: "#4f7d75",
        suffix: "%",
        points: cueMix,
      },
      {
        id: "efficiency_trend",
        label: "Recent efficiency trend",
        accent: "#1e3a8a",
        points:
          efficiencyTrend.length > 1
            ? efficiencyTrend
            : [{ label: "Current", value: reportRecord.score }],
      },
    ];

    const cards: AIVisualCard[] = [
      {
        datasetId: "attention_wave",
        title: "Session continuity",
        subtitle: reportRecord.fusionMode,
        chartType: "line",
        insight: reportRecord.cognitiveStateSummary,
        highlight: `${reportRecord.score}/100`,
      },
      {
        datasetId: "head_drift_wave",
        title: "Head-pose drift",
        subtitle: `${webcam.summary.attentionFractureCount} attention fracture(s)`,
        chartType: "line",
        insight:
          webcam.summary.attentionFractureCount > 0
            ? "Repeated head-pose drift suggests fragmented visual anchoring rather than one stable study posture."
            : "Head position stayed comparatively steady, so most inefficiency came from something other than physical drift.",
        highlight: `${Math.round(webcam.summary.maxHeadDeviation.yaw)} deg max yaw`,
      },
      {
        datasetId: "cue_mix",
        title: "Cognitive cue mix",
        subtitle: "Confusion, strain, posture, and device load",
        chartType: "bar",
        insight:
          webcam.summary.browFurrowRate >= webcam.summary.jawClenchRate
            ? "Confusion cues outweigh stress cues, which usually means the student stayed engaged but conceptually strained."
            : "Stress cues are rising faster than confusion cues, which points to pressure or frustration rather than clean productive struggle.",
        highlight: `${Math.round(webcam.summary.cognitiveLoadIndex * 100)} load`,
      },
      {
        datasetId: "efficiency_trend",
        title: "Recent efficiency trend",
        subtitle: "How this run compares to recent sessions",
        chartType: "line",
        insight:
          efficiencyTrend.length > 1
            ? "The session score should be read against recent runs, not in isolation."
            : "Run a few more sessions to turn Laminar.AI into a real trend tracker instead of a single snapshot.",
        highlight: `${streak} day streak`,
      },
    ];

    return {
      summary: `Laminar.AI condensed the raw vision telemetry into ${reportRecord.fusionMode}. The student scored ${reportRecord.score}/100 with ${Math.round(reportRecord.attentionRate * 100)}% continuity, ${Math.round(reportRecord.perclos * 100)}% PERCLOS, and ${reportRecord.visibilityLossCount} visibility break(s). ${reportRecord.screenCorrelationSummary}`,
      datasets,
      cards,
    };
  }, [reportRecord, recentReports, streak, webcam]);

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before opening the attention dashboard."
        description="Attention diagnostics and streaks are stored per person."
      />
    );
  }

  if (!webcam || !reportRecord) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="panel max-w-xl space-y-4">
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="section-title">Attention Dashboard</h1>
            <p className="section-copy">
              No vision telemetry yet. Save a study plan, run the webcam session, and return here
              to review the diagnostic.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="button-primary shadow-[0_12px_28px_rgba(15,61,62,0.14)]" href="/focus">
                New session
              </Link>
              <Link className="button-secondary" href="/academic">
                Academic dashboard
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const summary = webcam.summary;
  const diagnostic = webcam.diagnosticReport;
  const modeLabel = setup?.studyMode?.replace(/-/g, " ") ?? webcam.studyMode.replace(/-/g, " ");
  const lateCrash = detectLateCrash(webcam.samples);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="panel flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="section-title">Attention Dashboard</h1>
            <p className="section-copy">
              The AI report below cleans the raw vision telemetry into one readable diagnostic for
              this study mode, then grounds it with the screen-linked event traces underneath.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button-secondary" href="/focus">
              New session
            </Link>
            <Link className="button-secondary" href="/academic">
              Academic dashboard
            </Link>
            <Link className="button-secondary" href="/history">
              History
            </Link>
          </div>
        </header>

        <section className="panel space-y-4">
          <div>
            <p className="eyebrow">Session context</p>
            <h2 className="text-2xl font-semibold text-slate-950">
              {setup?.studentName ?? "Student"} / {setup?.moduleName ?? "Study session"}
            </h2>
            <p className="mt-2 text-sm text-slate-700">{setup?.topic ?? "Unspecified topic"}</p>
          </div>
          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <ContextPill label="Study mode" value={modeLabel} />
            <ContextPill label="Duration" value={formatMinutesSeconds(webcam.totalSeconds)} />
            <ContextPill label="Study source" value={setup?.focusDomain || "Not specified"} />
            <ContextPill label="Guard style" value={getGuardStyleLabel(setup?.guardStyle ?? "noob")} />
          </div>
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              reportRecord.goalAchieved
                ? "bg-emerald-50 text-emerald-900"
                : "bg-slate-950/5 text-slate-700"
            }`}
          >
            {reportRecord.goalAchieved
              ? `${reportRecord.badgeLabel} earned for this session.`
              : "The session crossed one or more guard thresholds, so Laminar.AI logged it as noisy diagnostic evidence rather than a clean run."}
          </div>
        </section>

        <section className="panel space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">AI Diagnostic</p>
              <h2 className="text-3xl font-semibold text-slate-950">
                {diagnostic?.primary_behavior_label ?? reportRecord.fusionMode}
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-700">
                {diagnostic?.cognitive_state_summary ?? reportRecord.cognitiveStateSummary}
              </p>
            </div>
            <div className="rounded-[1.5rem] bg-[#0f3d3e] px-5 py-4 text-center text-white shadow-[0_16px_38px_rgba(15,61,62,0.18)]">
              <div className="text-xs uppercase tracking-[0.18em] text-white/70">Efficiency</div>
              <div className="mt-2 text-5xl font-semibold">{reportRecord.score}</div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white/75 px-5 py-4 text-sm leading-7 text-slate-700">
            {reportRecord.reportText}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {reportRecord.optimizationTips.map((tip) => (
              <div
                key={tip}
                className="rounded-[1.35rem] border border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-700"
              >
                {tip}
              </div>
            ))}
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-[#0f3d3e]/6 px-5 py-4">
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Screen Correlation
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-700">
              {reportRecord.screenCorrelationSummary}
            </p>
            {reportRecord.topicHotspots.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {reportRecord.topicHotspots.map((hotspot: TopicHotspot) => (
                  <div
                    key={`${hotspot.label}-${hotspot.explanation}`}
                    className="rounded-[1.25rem] border border-slate-200 bg-white/85 px-4 py-4 text-sm text-slate-700"
                  >
                    <div className="font-semibold text-slate-900">{hotspot.label}</div>
                    <div className="mt-2 leading-7">{hotspot.explanation}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="Attention continuity"
            value={pct(reportRecord.attentionRate)}
            hint={`${reportRecord.lookAwaySpikes} spikes`}
          />
          <MetricCard label="PERCLOS" value={pct(reportRecord.perclos)} hint="fatigue marker" />
          <MetricCard
            label="Blink rate"
            value={`${reportRecord.blinkRatePerMinute}`}
            hint="per minute"
          />
          <MetricCard
            label="Attention fractures"
            value={String(reportRecord.attentionFractureCount)}
            hint="head-pose drift clusters"
          />
          <MetricCard
            label="Phone presence"
            value={pct(reportRecord.phoneDetectionRate)}
            hint={`${reportRecord.phoneDetectionEvents} phone samples`}
          />
          <MetricCard
            label="Visibility breaks"
            value={String(reportRecord.visibilityLossCount)}
            hint={`${Math.round(reportRecord.hiddenSeconds)} sec hidden`}
          />
          <MetricCard
            label="Slouch rate"
            value={pct(reportRecord.slouchRate)}
            hint={lateCrash ? "late-session drift detected" : "posture load"}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="panel space-y-4">
            <div>
              <p className="eyebrow">Mode-weighted interpretation</p>
              <h2 className="text-2xl font-semibold text-slate-950">What mattered in this study mode?</h2>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-sm leading-7 text-slate-700">
              {getModeInterpretation(webcam.studyMode)}
            </div>
          </div>

          <div className="panel space-y-4">
            <div>
              <p className="eyebrow">Streak</p>
              <h2 className="text-2xl font-semibold text-slate-950">{streak} successful day(s)</h2>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white/75 px-4 py-4 text-sm text-slate-700">
              Clean runs in casual and lock-in mode keep the streak moving. Noob mode is mainly for passive logging and baseline evidence.
            </div>
            <div className="rounded-[1.5rem] bg-slate-950/5 px-4 py-4 text-sm text-slate-700">
              Brow furrowing: {pct(summary.browFurrowRate)} / Jaw clenching: {pct(summary.jawClenchRate)} / Upright posture: {pct(summary.postureBreakdown.uprightPct)}
            </div>
          </div>
        </section>

        {visualBoard ? (
          <section className="panel space-y-5">
            <div>
              <p className="eyebrow">Telemetry Visuals</p>
              <h2 className="text-xl font-semibold text-slate-950">
                The cleaned report grounded by the raw session traces
              </h2>
            </div>
            {reportRecord.eventCorrelations.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {reportRecord.eventCorrelations.map((correlation: EventCorrelation) => (
                  <div
                    key={`visual-${correlation.event_label}-${correlation.visible_on_screen}-${correlation.visible_text_quote}`}
                    className="rounded-[1.5rem] border border-slate-200 bg-white/78 px-4 py-4 text-sm text-slate-700"
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {correlation.event_label}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">
                      {correlation.visible_on_screen}
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-950/5 px-3 py-2 text-sm font-medium text-slate-800">
                      Visible text: {correlation.visible_text_quote || "No exact text recovered"}
                    </div>
                    <p className="mt-3 leading-7">{correlation.interpretation}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <AIVisualGallery
              cards={visualBoard.cards}
              datasets={visualBoard.datasets}
              summary={visualBoard.summary}
            />
          </section>
        ) : null}

        <footer className="px-1 text-xs text-slate-500">
          Privacy: Laminar.AI stores only lightweight landmark-derived telemetry on this device.
          Webcam video is never uploaded or saved.
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

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  );
}
