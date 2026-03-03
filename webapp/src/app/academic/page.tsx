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
  type AcademicMergedTopic,
  type AcademicOverviewRecord,
  type UnderstandingChecklistState,
  type UnderstandingSessionRecord,
  isAcademicOverviewRecordLike,
  isUnderstandingSessionLike,
  setStoredJson,
  useCurrentProfile,
  useStoredJson,
} from "@/lib/studyos";

type AcademicItem = {
  id: string;
  createdAt: number;
  title: string;
  explanation: string;
  understood: boolean;
  topicHint: string;
  source: string;
};

type GeneratedVisualBoard = {
  createdAt: number;
  summary: string;
  cards: AIVisualCard[];
  signature: string;
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

export default function AcademicDashboardPage() {
  const currentProfile = useCurrentProfile();
  const aiAcademicOverview = useStoredJson<AcademicOverviewRecord | null>(
    STORAGE_KEYS.aiAcademicOverview,
    null,
    (value): value is AcademicOverviewRecord | null =>
      value === null || isAcademicOverviewRecordLike(value)
  );
  const checklist = useStoredJson<UnderstandingChecklistState>(
    STORAGE_KEYS.understandingChecklist,
    {},
    (value): value is UnderstandingChecklistState =>
      !!value && typeof value === "object" && !Array.isArray(value)
  );
  const understandingSessions = useStoredJson<UnderstandingSessionRecord[]>(
    STORAGE_KEYS.understandingSessions,
    [],
    (value): value is UnderstandingSessionRecord[] =>
      Array.isArray(value) && value.every((entry) => isUnderstandingSessionLike(entry))
  );

  const [overviewStatus, setOverviewStatus] = useState("");
  const [isGeneratingOverview, setIsGeneratingOverview] = useState(false);
  const [visualStatus, setVisualStatus] = useState("");
  const [isGeneratingVisuals, setIsGeneratingVisuals] = useState(false);
  const [academicVisuals, setAcademicVisuals] = useState<GeneratedVisualBoard | null>(null);

  const academicItems = useMemo(() => {
    const items: AcademicItem[] = [];

    for (const session of understandingSessions) {
      for (const weakness of session.weaknesses) {
        const itemId = `understanding:${session.id}:${weakness.id}`;
        items.push({
          id: itemId,
          createdAt: weakness.createdAt ?? session.createdAt,
          title: weakness.title,
          explanation: weakness.explanation,
          understood: checklist[itemId]?.understood ?? false,
          topicHint: session.topic,
          source: "understanding",
        });
      }
    }

    return items.sort((left, right) => right.createdAt - left.createdAt);
  }, [checklist, understandingSessions]);

  const totalItems = academicItems.length;
  const understoodItems = academicItems.filter((item) => item.understood).length;

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
            detail: `Understanding Coach / ${session.topic}`,
          };
        }),
    [checklist, understandingSessions]
  );

  const fallbackTopics = useMemo(() => fallbackMergedTopics(academicItems), [academicItems]);
  const overviewIsFresh = aiAcademicOverview?.itemCount === academicItems.length;
  const mergedTopics =
    overviewIsFresh && aiAcademicOverview ? aiAcademicOverview.mergedTopics : fallbackTopics;

  const mergedReportGroups = useMemo(() => {
    return mergedTopics
      .map((topic) => {
        const items = topic.itemIds
          .map((itemId) => academicItems.find((item) => item.id === itemId))
          .filter((item): item is AcademicItem => Boolean(item))
          .sort((left, right) => right.createdAt - left.createdAt);

        return {
          ...topic,
          items,
          understoodCount: items.filter((item) => item.understood).length,
        };
      })
      .filter((group) => group.items.length > 0)
      .sort((left, right) => {
        const leftLatest = left.items[0]?.createdAt ?? 0;
        const rightLatest = right.items[0]?.createdAt ?? 0;
        return rightLatest - leftLatest;
      });
  }, [academicItems, mergedTopics]);

  const academicVisualDatasets = useMemo<AIVisualDataset[]>(() => {
    const datasets: AIVisualDataset[] = [];
    const topGroups = mergedReportGroups.slice(0, 5);

    if (masterySeries.length > 0) {
      datasets.push({
        id: "mastery_trend",
        label: "Mastery trend",
        accent: "#0f3d3e",
        suffix: "%",
        points: masterySeries.slice(-10).map((entry) => ({
          label: entry.label,
          value: entry.value,
        })),
      });
    }

    if (topGroups.length > 0) {
      datasets.push({
        id: "topic_pressure",
        label: "Highest-pressure topics",
        accent: "#c96f3b",
        points: topGroups.map((group, index) => ({
          label: group.label,
          value: group.items.length,
          color: ["#d17a44", "#0f3d3e", "#4f7d75", "#1e3a8a", "#b45309"][index % 5],
        })),
      });

      datasets.push({
        id: "unresolved_pressure",
        label: "Unresolved concepts by topic",
        accent: "#0f3d3e",
        points: topGroups.map((group, index) => ({
          label: group.label,
          value: group.items.length - group.understoodCount,
          color: ["#0f3d3e", "#d17a44", "#4f7d75", "#1e3a8a", "#b45309"][index % 5],
        })),
      });
    }

    if (academicItems.length > 0) {
      const recentCounts = new Map<string, number>();
      for (const item of academicItems.slice(0, 40)) {
        const label = new Date(item.createdAt).toLocaleDateString();
        recentCounts.set(label, (recentCounts.get(label) ?? 0) + 1);
      }

      datasets.push({
        id: "recent_flags",
        label: "Weakness log density",
        accent: "#7c3aed",
        points: [...recentCounts.entries()].slice(0, 6).map(([label, value]) => ({
          label,
          value,
        })),
      });
    }

    return datasets.filter((dataset) => dataset.points.length > 0);
  }, [academicItems, masterySeries, mergedReportGroups]);

  const academicVisualSignature = JSON.stringify(
    academicVisualDatasets.map((dataset) => ({
      id: dataset.id,
      labels: dataset.points.map((point) => point.label),
      values: dataset.points.map((point) => point.value),
    }))
  );
  const academicVisualsAreFresh = academicVisuals?.signature === academicVisualSignature;

  useEffect(() => {
    setAcademicVisuals((current) =>
      current?.signature === academicVisualSignature ? current : null
    );
  }, [academicVisualSignature]);

  async function generateAcademicOverview() {
    if (academicItems.length === 0) return;

    setIsGeneratingOverview(true);
    setOverviewStatus("Generating merged academic overview...");

    try {
      const response = await fetch("/api/ai/academic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: academicItems.map((item) => ({
            id: item.id,
            topicHint: item.topicHint,
            title: item.title,
            explanation: item.explanation,
            understood: item.understood,
            createdAt: item.createdAt,
            source: item.source,
          })),
          masterySeries: masterySeries.map((entry) => ({
            label: entry.label,
            value: entry.value,
            detail: entry.detail,
          })),
        }),
      });
      const payload = (await response.json()) as
        | (AcademicOverviewRecord & { error?: string })
        | { error?: string }
        | undefined;

      if (!response.ok || !payload || !("mergedTopics" in payload)) {
        throw new Error(payload?.error || "Academic overview generation failed.");
      }

      setStoredJson(STORAGE_KEYS.aiAcademicOverview, payload);
      setOverviewStatus("Academic overview updated.");
    } catch (error) {
      setOverviewStatus(
        error instanceof Error ? error.message : "Academic overview generation failed."
      );
    } finally {
      setIsGeneratingOverview(false);
    }
  }

  function toggleUnderstanding(itemId: string, understood: boolean, updatedAt: number) {
    setStoredJson(STORAGE_KEYS.understandingChecklist, {
      ...checklist,
      [itemId]: {
        understood,
        updatedAt,
      },
    });
  }

  async function generateAcademicVisuals() {
    if (academicVisualDatasets.length < 2) return;

    setIsGeneratingVisuals(true);
    setVisualStatus("Designing an AI academic board...");

    try {
      const response = await fetch("/api/ai/visuals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "academic",
          controlsLabel: "Using the strongest recent academic signals.",
          pageContext: JSON.stringify({
            totalItems,
            understoodItems,
            mergedTopicCount: mergedReportGroups.length,
            overviewWeakVsCareless: aiAcademicOverview?.weakVsCareless ?? "",
            overviewTrajectory: aiAcademicOverview?.trajectory ?? "",
          }),
          datasets: academicVisualDatasets.map((dataset) => ({
            id: dataset.id,
            label: dataset.label,
            defaultChartType: dataset.id === "mastery_trend" ? "line" : "bar",
            supportedChartTypes: dataset.id === "mastery_trend" ? ["line", "bar"] : ["bar", "donut"],
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

      setAcademicVisuals({
        createdAt: payload.createdAt,
        summary: payload.summary,
        cards: payload.cards,
        signature: academicVisualSignature,
      });
      setVisualStatus("AI academic board updated.");
    } catch (error) {
      setVisualStatus(error instanceof Error ? error.message : "Visual generation failed.");
    } finally {
      setIsGeneratingVisuals(false);
    }
  }

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before opening the academic dashboard."
        description="Understanding reports and mastery checkboxes are scoped per person."
      />
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="panel flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="section-title">Academic Dashboard</h1>
            <p className="section-copy">
              This dashboard merges the student&apos;s weak concepts into one understanding report
              and uses AI to normalize topic names plus explain the bigger learning pattern.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button-secondary" href="/focus">
              New session
            </Link>
            <Link className="button-secondary" href="/understanding">
              Understanding coach
            </Link>
            <Link className="button-secondary" href="/dashboard">
              Attention dashboard
            </Link>
            <Link className="button-secondary" href="/history">
              History
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Merged topics" value={String(mergedReportGroups.length)} hint="combined by AI or local fallback" />
          <StatCard label="Weakness items" value={String(totalItems)} hint="all tracked weak areas" />
          <StatCard
            label="Understood now"
            value={totalItems ? `${Math.round((understoodItems / totalItems) * 100)}%` : "-"}
            hint={`${understoodItems} of ${totalItems} concepts checked off`}
          />
        </section>

        <section className="panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">AI Overview</p>
              <h2 className="text-xl font-semibold text-slate-950">Academic pattern analysis</h2>
            </div>
            <button
              className="button-primary shadow-[0_12px_28px_rgba(15,61,62,0.14)]"
              disabled={academicItems.length === 0 || isGeneratingOverview}
              onClick={generateAcademicOverview}
              type="button"
            >
              {isGeneratingOverview ? "Analyzing..." : overviewIsFresh ? "Refresh AI overview" : "Generate AI overview"}
            </button>
          </div>
          {overviewStatus ? <div className="text-sm text-slate-600">{overviewStatus}</div> : null}
          {!overviewIsFresh || !aiAcademicOverview ? (
            <p className="text-sm text-slate-600">
              Generate the AI overview to merge similar topics and get a higher-level diagnosis of
              the student&apos;s academic pattern.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <InsightCard
                title="Weak concepts vs careless mistakes"
                body={aiAcademicOverview.weakVsCareless}
              />
              <InsightCard title="Progress pattern" body={aiAcademicOverview.trajectory} />
              <InsightListCard
                items={aiAcademicOverview.limitedTimeFocus}
                title="What to focus on with limited time"
              />
              <InsightCard
                title="Why the same struggles repeat"
                body={aiAcademicOverview.repeatedStruggleReason}
              />
            </div>
          )}
        </section>

        <section className="panel space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Understanding report</p>
              <h2 className="text-xl font-semibold text-slate-950">One merged weakness log</h2>
            </div>
            <div className="rounded-full bg-slate-950/5 px-4 py-2 text-sm text-slate-700">
              {understoodItems}/{totalItems} understood
            </div>
          </div>

          {mergedReportGroups.length === 0 ? (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 px-5 py-5 text-sm text-slate-600">
              No saved understanding data yet. Open Understanding Coach, describe what the student
              is stuck on, and Laminar.AI will start building this report.
            </div>
          ) : (
            <div className="space-y-6">
              {mergedReportGroups.map((group) => (
                <div key={group.id} className="space-y-3 border-t border-slate-200/80 pt-6 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-2xl font-semibold text-slate-950">{group.label}</div>
                      {group.aliases.length > 1 ? (
                        <div className="mt-2 text-sm text-slate-500">
                          Merged from: {group.aliases.slice(0, 4).join(", ")}
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-full bg-slate-950/5 px-4 py-2 text-sm text-slate-700">
                      {group.understoodCount}/{group.items.length} understood
                    </div>
                  </div>

                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-[1.5rem] border px-5 py-4 ${
                          item.understood
                            ? "border-emerald-200 bg-emerald-50/80"
                            : "border-slate-200 bg-white/80"
                        }`}
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-2 text-sm text-slate-700">
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="text-base font-semibold text-slate-950">
                                {item.title}
                              </div>
                              <span className="rounded-full bg-slate-950/5 px-3 py-1 text-xs font-medium text-slate-600">
                                Flagged {new Date(item.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p>{summarizeExplanation(item.explanation)}</p>
                          </div>
                          <label
                            className={`flex shrink-0 items-center gap-3 rounded-full border px-4 py-3 text-sm font-semibold shadow-sm ${
                              item.understood
                                ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                                : "border-slate-200 bg-white text-slate-900"
                            }`}
                          >
                            <input
                              checked={item.understood}
                              className="h-4 w-4 accent-[#0f3d3e]"
                              onChange={(event) =>
                                toggleUnderstanding(
                                  item.id,
                                  event.target.checked,
                                  Math.round(event.timeStamp)
                                )
                              }
                              type="checkbox"
                            />
                            <span>I understand this now</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">AI Visual Board</p>
              <h2 className="text-xl font-semibold text-slate-950">Academic patterns rendered in-app</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                AI turns the merged academic record into a curated chart board. The visuals use a
                fixed view of the strongest recent weakness patterns.
              </p>
            </div>
            <button
              className="button-primary shadow-[0_12px_28px_rgba(15,61,62,0.14)]"
              disabled={academicVisualDatasets.length < 2 || isGeneratingVisuals}
              onClick={generateAcademicVisuals}
              type="button"
            >
              {isGeneratingVisuals
                ? "Designing..."
                : academicVisualsAreFresh
                  ? "Refresh visual board"
                  : "Generate visual board"}
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-[1.6rem] border border-slate-200 bg-white/78 px-5 py-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Visual Source
              </div>
              <div className="mt-3 text-4xl font-semibold text-slate-950">
                {Math.min(mergedReportGroups.length, 5)}
              </div>
              <div className="mt-1 text-sm text-slate-600">top merged topic groups prioritized</div>
              <div className="mt-5 rounded-[1.25rem] bg-slate-950/5 px-4 py-4 text-sm text-slate-700">
                {understoodItems}/{totalItems} weakness items are currently checked off.
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-slate-200 bg-white/78 px-5 py-5">
              {visualStatus ? <div className="mb-4 text-sm text-slate-600">{visualStatus}</div> : null}
              {!academicVisualsAreFresh || !academicVisuals ? (
                <p className="text-sm leading-7 text-slate-600">
                  Generate the visual board to let AI choose the most useful academic charts from
                  the merged weakness log and mastery history already stored in Laminar.AI.
                </p>
              ) : (
                <AIVisualGallery
                  cards={academicVisuals.cards}
                  datasets={academicVisualDatasets}
                  summary={academicVisuals.summary}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
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

function InsightListCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 px-5 py-5">
      <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm leading-7 text-slate-700">No focus priorities returned yet.</p>
      ) : (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-700">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function summarizeExplanation(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= 180) return trimmed;
  return `${trimmed.slice(0, 177).trimEnd()}...`;
}
