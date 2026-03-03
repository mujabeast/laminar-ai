"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  AIVisualGallery,
  type AIVisualCard,
  type AIVisualDataset,
} from "@/components/ai-visual-gallery";
import { ProfileRequired } from "@/components/profile-required";
import {
  STORAGE_KEYS,
  type AcademicMergedTopic,
  type AcademicOverviewRecord,
  type UnderstandingChecklistState,
  type UnderstandingSessionRecord,
  calculateDailyStreak,
  isAcademicOverviewRecordLike,
  isUnderstandingSessionLike,
  removeStoredValue,
  useCurrentProfile,
  useStoredJson,
} from "@/lib/studyos";
import {
  type AttentionReportRecord,
  isAttentionReportRecordLike,
} from "@/lib/telemetry";

type AcademicItem = {
  id: string;
  createdAt: number;
  title: string;
  topicHint: string;
  understood: boolean;
};

function normalizeTopicToken(value: string) {
  return value
    .toLowerCase()
    .replace(/\bunderstanding coach\b/g, " ")
    .replace(/\b[a-z]{2,}\d{3,5}\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackMergedTopics(items: AcademicItem[]): AcademicMergedTopic[] {
  const grouped = new Map<
    string,
    {
      label: string;
      aliases: Set<string>;
      itemIds: string[];
    }
  >();

  for (const item of items) {
    const rawLabel = item.topicHint.trim() || item.title.trim();
    const key = normalizeTopicToken(rawLabel) || item.id;
    const existing = grouped.get(key) ?? {
      label: rawLabel,
      aliases: new Set<string>(),
      itemIds: [],
    };

    existing.aliases.add(rawLabel);
    existing.itemIds.push(item.id);

    if (rawLabel.length > existing.label.length) {
      existing.label = rawLabel;
    }

    grouped.set(key, existing);
  }

  return [...grouped.entries()].map(([key, value]) => ({
    id: key,
    label: value.label,
    aliases: [...value.aliases],
    itemIds: value.itemIds,
  }));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildTrajectoryLabel(delta: number, positiveLabel: string, negativeLabel: string) {
  if (delta >= 8) return positiveLabel;
  if (delta <= -8) return negativeLabel;
  return "Holding relatively steady";
}

export default function HistoryPage() {
  const currentProfile = useCurrentProfile();
  const reportHistory = useStoredJson<AttentionReportRecord[]>(
    STORAGE_KEYS.reportHistory,
    [],
    (value): value is AttentionReportRecord[] =>
      Array.isArray(value) && value.every((entry) => isAttentionReportRecordLike(entry))
  );
  const understandingSessions = useStoredJson<UnderstandingSessionRecord[]>(
    STORAGE_KEYS.understandingSessions,
    [],
    (value): value is UnderstandingSessionRecord[] =>
      Array.isArray(value) && value.every((entry) => isUnderstandingSessionLike(entry))
  );
  const checklist = useStoredJson<UnderstandingChecklistState>(
    STORAGE_KEYS.understandingChecklist,
    {},
    (value): value is UnderstandingChecklistState =>
      !!value && typeof value === "object" && !Array.isArray(value)
  );
  const aiAcademicOverview = useStoredJson<AcademicOverviewRecord | null>(
    STORAGE_KEYS.aiAcademicOverview,
    null,
    (value): value is AcademicOverviewRecord | null =>
      value === null || isAcademicOverviewRecordLike(value)
  );

  const streak = calculateDailyStreak(reportHistory);

  const sortedReports = useMemo(
    () => reportHistory.slice().sort((left, right) => left.createdAt - right.createdAt),
    [reportHistory]
  );

  const academicItems = useMemo(() => {
    const items: AcademicItem[] = [];

    for (const session of understandingSessions) {
      for (const weakness of session.weaknesses) {
        const itemId = `understanding:${session.id}:${weakness.id}`;
        items.push({
          id: itemId,
          createdAt: weakness.createdAt ?? session.createdAt,
          title: weakness.title,
          topicHint: session.topic,
          understood: checklist[itemId]?.understood ?? false,
        });
      }
    }

    return items.sort((left, right) => left.createdAt - right.createdAt);
  }, [checklist, understandingSessions]);

  const masterySeries = useMemo(
    () =>
      understandingSessions
        .slice()
        .sort((left, right) => left.createdAt - right.createdAt)
        .map((session) => {
          const understood = session.weaknesses.filter(
            (weakness) => checklist[`understanding:${session.id}:${weakness.id}`]?.understood
          ).length;
          const total = session.weaknesses.length;
          const score = total ? Math.round((understood / total) * 100) : 0;

          return {
            ts: session.createdAt,
            label: new Date(session.createdAt).toLocaleDateString(),
            value: score,
            detail: session.topic,
          };
        }),
    [checklist, understandingSessions]
  );

  const mergedTopics = useMemo(() => {
    if (aiAcademicOverview?.mergedTopics?.length) return aiAcademicOverview.mergedTopics;
    return fallbackMergedTopics(academicItems);
  }, [academicItems, aiAcademicOverview]);

  const combinedTopicInsights = useMemo(() => {
    return mergedTopics
      .map((topic) => {
        const unresolvedItems = topic.itemIds
          .map((itemId) => academicItems.find((item) => item.id === itemId))
          .filter((item): item is AcademicItem => Boolean(item))
          .filter((item) => !item.understood);

        const topicToken = normalizeTopicToken(topic.label);
        const relatedReports = reportHistory.filter((report) => {
          const reportToken = normalizeTopicToken(`${report.moduleName} ${report.topic}`);
          return (
            topicToken &&
            reportToken &&
            (reportToken.includes(topicToken) || topicToken.includes(reportToken))
          );
        });

        const avgAttention = relatedReports.length
          ? average(relatedReports.map((report) => report.attentionRate * 100))
          : null;
        const avgEfficiency = relatedReports.length
          ? average(relatedReports.map((report) => report.score))
          : null;
        const pressureScore =
          unresolvedItems.length * 24 +
          (avgAttention === null ? 10 : Math.max(0, 100 - avgAttention) * 0.45) +
          (avgEfficiency === null ? 8 : Math.max(0, 100 - avgEfficiency) * 0.3);

        return {
          label: topic.label,
          unresolvedCount: unresolvedItems.length,
          avgAttention,
          avgEfficiency,
          pressureScore: Math.round(pressureScore),
        };
      })
      .filter((entry) => entry.unresolvedCount > 0 || entry.avgAttention !== null)
      .sort((left, right) => right.pressureScore - left.pressureScore)
      .slice(0, 5);
  }, [academicItems, mergedTopics, reportHistory]);

  const attentionDelta = useMemo(() => {
    if (sortedReports.length < 2) return 0;
    const midpoint = Math.max(1, Math.floor(sortedReports.length / 2));
    const firstHalf = sortedReports.slice(0, midpoint);
    const lastHalf = sortedReports.slice(midpoint);
    return (
      average(lastHalf.map((entry) => entry.score)) - average(firstHalf.map((entry) => entry.score))
    );
  }, [sortedReports]);

  const masteryDelta = useMemo(() => {
    if (masterySeries.length < 2) return 0;
    return masterySeries[masterySeries.length - 1].value - masterySeries[0].value;
  }, [masterySeries]);

  const totalWeaknesses = academicItems.length;
  const unresolvedWeaknesses = academicItems.filter((item) => !item.understood).length;
  const latestReport = reportHistory[0] ?? null;
  const latestMastery = masterySeries[masterySeries.length - 1]?.value ?? 0;

  const progressNarrative = useMemo(() => {
    const attentionSummary =
      sortedReports.length === 0
        ? "No attention history has been recorded yet."
        : `${buildTrajectoryLabel(attentionDelta, "Attention is improving", "Attention is regressing")} across ${sortedReports.length} tracked focus session(s).`;

    const academicSummary =
      masterySeries.length === 0
        ? "No academic mastery history has been recorded yet."
        : `${buildTrajectoryLabel(masteryDelta, "Academic mastery is improving", "Academic mastery is slipping")} across ${masterySeries.length} understanding checkpoint(s).`;

    const topCombined = combinedTopicInsights[0];
    const relationshipSummary = topCombined
      ? topCombined.avgAttention !== null
        ? `The strongest cross-signal pressure is around ${topCombined.label}: ${topCombined.unresolvedCount} unresolved academic item(s) and roughly ${Math.round(topCombined.avgAttention)}% average attention on related focus runs.`
        : `The biggest academic pressure is currently ${topCombined.label}, but there is not enough matching attention history yet to compare the two signals directly.`
      : "There is not enough overlapping history yet to connect attention patterns to academic weak areas."
;

    const recommendation = topCombined
      ? topCombined.avgAttention !== null && topCombined.avgAttention < 60
        ? `The next useful move is to revisit ${topCombined.label} in a shorter, cleaner study block, because weak focus may be amplifying the academic difficulty.`
        : `The next useful move is to revisit ${topCombined.label} with deliberate practice, because the academic weakness is still present even when attention seems relatively intact.`
      : "Run more focus sessions and understanding check-ins so Laminar.AI can build a stronger cross-signal baseline.";

    return {
      attentionSummary,
      academicSummary,
      relationshipSummary,
      recommendation,
    };
  }, [attentionDelta, combinedTopicInsights, masteryDelta, masterySeries.length, sortedReports.length]);

  const datasets = useMemo<AIVisualDataset[]>(() => {
    const result: AIVisualDataset[] = [];

    if (sortedReports.length > 0) {
      result.push({
        id: "attention_trend",
        label: "Attention score trend",
        accent: "#0f3d3e",
        points: sortedReports.slice(-12).map((entry) => ({
          label: new Date(entry.createdAt).toLocaleDateString(),
          value: entry.score,
        })),
      });
    }

    if (masterySeries.length > 0) {
      result.push({
        id: "mastery_trend",
        label: "Academic mastery trend",
        accent: "#c96f3b",
        suffix: "%",
        points: masterySeries.slice(-12).map((entry) => ({
          label: entry.label,
          value: entry.value,
        })),
      });
    }

    if (combinedTopicInsights.length > 0) {
      result.push({
        id: "cross_signal_topics",
        label: "Cross-signal topic pressure",
        accent: "#1e3a8a",
        points: combinedTopicInsights.map((entry) => ({
          label: entry.label,
          value: entry.pressureScore,
          color: "#1e3a8a",
        })),
      });
    }

    if (sortedReports.length > 0) {
      result.push({
        id: "attention_quality_mix",
        label: "Attention quality mix",
        accent: "#4f7d75",
        suffix: "",
        points: [
          {
            label: "High focus",
            value: sortedReports.filter((entry) => entry.score >= 75).length,
            color: "#0f3d3e",
          },
          {
            label: "Medium focus",
            value: sortedReports.filter((entry) => entry.score >= 50 && entry.score < 75).length,
            color: "#c96f3b",
          },
          {
            label: "Low focus",
            value: sortedReports.filter((entry) => entry.score < 50).length,
            color: "#b91c1c",
          },
        ],
      });
    }

    return result;
  }, [combinedTopicInsights, masterySeries, sortedReports]);

  const cards: AIVisualCard[] = useMemo(() => {
    const result: AIVisualCard[] = [];

    if (datasets.some((dataset) => dataset.id === "attention_trend")) {
      result.push({
        datasetId: "attention_trend",
        title: "Attention progress",
        subtitle: progressNarrative.attentionSummary,
        chartType: "line",
        insight:
          "This traces how efficiently the student has been holding attention from run to run, not just within one session.",
        highlight: latestReport ? `${latestReport.score}/100 latest` : "No data",
      });
    }

    if (datasets.some((dataset) => dataset.id === "mastery_trend")) {
      result.push({
        datasetId: "mastery_trend",
        title: "Academic progress",
        subtitle: progressNarrative.academicSummary,
        chartType: "line",
        insight:
          "This shows how many tracked weak concepts have been turned into understood concepts over time.",
        highlight: `${latestMastery}% latest mastery`,
      });
    }

    if (datasets.some((dataset) => dataset.id === "cross_signal_topics")) {
      result.push({
        datasetId: "cross_signal_topics",
        title: "Cross-signal topic pressure",
        subtitle: "Where focus instability and academic weakness overlap most",
        chartType: "bar",
        insight: progressNarrative.relationshipSummary,
        highlight: `${combinedTopicInsights.length} linked topic(s)`,
      });
    }

    if (datasets.some((dataset) => dataset.id === "attention_quality_mix")) {
      result.push({
        datasetId: "attention_quality_mix",
        title: "Attention quality mix",
        subtitle: "Distribution of focus sessions by quality",
        chartType: "donut",
        insight:
          "This gives a fast view of whether the student's recent study history is mostly clean, mixed, or dominated by weak-attention runs.",
        highlight: `${sortedReports.length} focus runs`,
      });
    }

    return result;
  }, [
    combinedTopicInsights.length,
    datasets,
    latestMastery,
    latestReport,
    progressNarrative.academicSummary,
    progressNarrative.attentionSummary,
    progressNarrative.relationshipSummary,
    sortedReports.length,
  ]);

  function clearAttentionHistory() {
    removeStoredValue(STORAGE_KEYS.attentionHistory);
    removeStoredValue(STORAGE_KEYS.attentionLast);
    removeStoredValue(STORAGE_KEYS.reportHistory);
  }

  function clearAcademicHistory() {
    removeStoredValue(STORAGE_KEYS.understandingSessions);
    removeStoredValue(STORAGE_KEYS.understandingChecklist);
    removeStoredValue(STORAGE_KEYS.aiAcademicOverview);
  }

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before opening history."
        description="Saved diagnostics and academic records are stored per person."
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
              This page combines attention and academic records into one progress view, so you can
              see how study behavior and conceptual weakness may be affecting each other over time.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button-secondary" href="/focus">
              New session
            </Link>
            <Link className="button-secondary" href="/dashboard">
              Attention dashboard
            </Link>
            <Link className="button-secondary" href="/academic">
              Academic dashboard
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatPanel label="Attention runs" value={String(reportHistory.length)} hint="tracked focus sessions" />
          <StatPanel label="Academic check-ins" value={String(understandingSessions.length)} hint="understanding sessions" />
          <StatPanel label="Current streak" value={String(streak)} hint="successful day(s)" />
          <StatPanel
            label="Unresolved concepts"
            value={String(unresolvedWeaknesses)}
            hint={`${totalWeaknesses} total weakness items`}
          />
        </section>

        <section className="panel space-y-4">
          <div>
            <p className="eyebrow">Combined Report</p>
            <h2 className="text-xl font-semibold text-slate-950">Progress across attention and academics</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <InsightCard title="Attention progress" body={progressNarrative.attentionSummary} />
            <InsightCard title="Academic progress" body={progressNarrative.academicSummary} />
            <InsightCard title="Cross-signal relationship" body={progressNarrative.relationshipSummary} />
            <InsightCard title="Recommended next move" body={progressNarrative.recommendation} />
          </div>
        </section>

        <section className="panel space-y-5">
          <div>
            <p className="eyebrow">Combined Visuals</p>
            <h2 className="text-xl font-semibold text-slate-950">Attention and academic trends together</h2>
          </div>
          {datasets.length === 0 ? (
            <p className="text-sm text-slate-600">
              There is not enough saved attention or academic history yet. Run a few focus sessions
              and understanding check-ins, then come back here.
            </p>
          ) : (
            <AIVisualGallery
              cards={cards}
              datasets={datasets}
              summary={`${progressNarrative.attentionSummary} ${progressNarrative.academicSummary} ${progressNarrative.relationshipSummary}`}
            />
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="panel space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">Attention archive</p>
                <h2 className="text-xl font-semibold text-slate-950">Saved focus diagnostics</h2>
              </div>
              <button className="button-secondary" onClick={clearAttentionHistory} type="button">
                Clear
              </button>
            </div>
            {reportHistory.length === 0 ? (
              <p className="text-sm text-slate-600">No saved attention runs yet.</p>
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
                          {report.moduleName} / {report.topic}
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
                        {report.goalAchieved ? report.badgeLabel : "Thresholds crossed"}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                      <div>Score: {report.score}</div>
                      <div>Attention: {Math.round(report.attentionRate * 100)}%</div>
                      <div>PERCLOS: {Math.round(report.perclos * 100)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow">Academic archive</p>
                <h2 className="text-xl font-semibold text-slate-950">Saved understanding sessions</h2>
              </div>
              <button className="button-secondary" onClick={clearAcademicHistory} type="button">
                Clear
              </button>
            </div>
            {understandingSessions.length === 0 ? (
              <p className="text-sm text-slate-600">No understanding sessions saved yet.</p>
            ) : (
              <div className="space-y-3">
                {understandingSessions.slice().reverse().slice(0, 8).map((session) => (
                  <div
                    key={session.id}
                    className="rounded-[1.5rem] border border-slate-200 bg-white/80 px-4 py-4"
                  >
                    <div className="font-medium text-slate-900">
                      {session.studentName} / {session.topic}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {new Date(session.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-700">
                      <span>{session.weaknesses.length} weakness item(s)</span>
                      <span>{session.uploads.length} upload(s)</span>
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

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 px-5 py-5">
      <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</div>
      <p className="mt-3 text-sm leading-7 text-slate-700">{body}</p>
    </div>
  );
}
