"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useState } from "react";

import {
  STORAGE_KEYS,
  type ConfusionCapture,
  type ExtensionHistoryEntry,
  type ExtensionSession,
  type StudyRunRecord,
  type StudySetup,
  formatMinutesSeconds,
  getStoredJson,
  isExtensionSessionLike,
  isStudyRunRecordLike,
  isStudySetupLike,
  removeStoredValue,
  setStoredJson,
  syncStudyRunToExtension,
  upsertCurrentStudyRun,
  useStoredJson,
} from "@/lib/studyos";

const MAX_CAPTURE_WIDTH = 960;
const MAX_CAPTURE_HEIGHT = 540;
const CAPTURE_JPEG_QUALITY = 0.6;
const MAX_EXTENSION_LAST_BYTES = 2_500_000;

function isQuotaExceededError(error: unknown) {
  return error instanceof DOMException && (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED"
  );
}

function getSerializedBytes(value: unknown) {
  return new Blob([JSON.stringify(value)]).size;
}

async function compressCaptureDataUrl(dataUrl?: string) {
  if (!dataUrl?.startsWith("data:image/")) return dataUrl;

  return new Promise<string | undefined>((resolve) => {
    const image = new Image();

    image.onload = () => {
      const scale = Math.min(
        1,
        MAX_CAPTURE_WIDTH / image.naturalWidth,
        MAX_CAPTURE_HEIGHT / image.naturalHeight
      );
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", CAPTURE_JPEG_QUALITY));
    };

    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function optimizeConfusionCaptures(captures: ConfusionCapture[]) {
  return Promise.all(
    captures.map(async (capture) => ({
      ...capture,
      screenshotDataUrl: await compressCaptureDataUrl(capture.screenshotDataUrl),
    }))
  );
}

function trimCaptureImagesToFit(captures: ConfusionCapture[], maxBytes: number) {
  const next = captures.map((capture) => ({ ...capture }));

  while (getSerializedBytes(next) > maxBytes) {
    const indexToTrim = next.findIndex((capture) => Boolean(capture.screenshotDataUrl));
    if (indexToTrim === -1) break;
    next[indexToTrim] = {
      ...next[indexToTrim],
      screenshotDataUrl: undefined,
    };
  }

  return next;
}

export function ExtensionImportPanel({
  title = "Choose an export file",
  eyebrow = "Upload",
  description = "Upload a JSON export from the browser extension to merge screen behavior with webcam attention.",
  showDashboardLink = false,
  showHistoryLink = false,
  compact = false,
  stepNumber,
  highlight = false,
  redirectTo,
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
  showDashboardLink?: boolean;
  showHistoryLink?: boolean;
  compact?: boolean;
  stepNumber?: number;
  highlight?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
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
  const [status, setStatus] = useState("No file imported yet.");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    if (currentRun) {
      syncStudyRunToExtension(currentRun);
    }
  }, [currentRun]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setStatus("Reading file...");

      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      if (!isExtensionSessionLike(parsed)) {
        setStatus("This does not look like a Laminar.AI export JSON.");
        setSummary("");
        return;
      }

      const shouldAttachToCurrentRun =
        Boolean(currentRun?.studyRunId) &&
        Boolean(currentRun?.webcamSessionId) &&
        !currentRun?.extensionSessionId;
      const resolvedStudyRunId =
        shouldAttachToCurrentRun
          ? currentRun?.studyRunId
          : parsed.studyRunId || currentRun?.studyRunId;

      const data: ExtensionSession = {
        sessionId: parsed.sessionId,
        studyRunId: resolvedStudyRunId,
        startedAt: parsed.startedAt,
        endedAt: parsed.endedAt,
        tabEvents: Array.isArray(parsed.tabEvents) ? parsed.tabEvents : [],
        tabSpans: Array.isArray(parsed.tabSpans) ? parsed.tabSpans : [],
        confusionCaptures: await optimizeConfusionCaptures(
          Array.isArray(parsed.confusionCaptures) ? parsed.confusionCaptures : []
        ),
        setupSnapshot: currentSetup,
      };

      const trimmedCurrentCaptures = trimCaptureImagesToFit(
        data.confusionCaptures ?? [],
        MAX_EXTENSION_LAST_BYTES
      );
      const currentData: ExtensionSession = {
        ...data,
        confusionCaptures: trimmedCurrentCaptures,
      };
      const historyEntry: ExtensionHistoryEntry = {
        ...data,
        confusionCaptures: (data.confusionCaptures ?? []).map((capture) => ({
          ...capture,
          screenshotDataUrl: undefined,
        })),
        setupSnapshot: currentSetup,
        importedAt: Date.now(),
        filename: file.name,
      };
      const storedPreviewCount = trimmedCurrentCaptures.filter(
        (capture) => Boolean(capture.screenshotDataUrl)
      ).length;

      setStoredJson(STORAGE_KEYS.extensionLast, currentData);

      const history = getStoredJson<ExtensionHistoryEntry[]>(STORAGE_KEYS.extensionHistory, []);
      history.unshift(historyEntry);
      setStoredJson(STORAGE_KEYS.extensionHistory, history.slice(0, 20));
      upsertCurrentStudyRun({
        studyRunId: currentData.studyRunId,
        setup: currentSetup,
        extensionSessionId: currentData.sessionId ?? null,
        extensionCompletedAt: currentData.endedAt ?? Date.now(),
      });

      const spans = currentData.tabSpans ?? [];
      const confusionCaptures = currentData.confusionCaptures ?? [];
      const totalMs = spans.reduce((sum, span) => sum + (span.durationMs || 0), 0);

      const topDomains = [...spans.reduce((map, span) => {
        const domain = span.domain || "unknown";
        map.set(domain, (map.get(domain) ?? 0) + (span.durationMs || 0));
        return map;
      }, new Map<string, number>()).entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      setSummary(
        [
          `Loaded: ${file.name}`,
          `Tab spans: ${spans.length}`,
          `Confusion captures: ${confusionCaptures.length}`,
          `Locally stored screenshot previews: ${storedPreviewCount}/${confusionCaptures.length}`,
          `Study run ID: ${currentData.studyRunId || "missing in export"}`,
          shouldAttachToCurrentRun && parsed.studyRunId && parsed.studyRunId !== currentData.studyRunId
            ? "Imported file was attached to the current webcam run in the app."
            : null,
          `Total tracked time: ${formatMinutesSeconds(totalMs / 1000)}`,
          "Top domains:",
          ...topDomains.map(
            ([domain, durationMs]) => `- ${domain}: ${formatMinutesSeconds(durationMs / 1000)}`
          ),
        ].filter(Boolean).join("\n")
      );

      setStatus(
        shouldAttachToCurrentRun && parsed.studyRunId && parsed.studyRunId !== currentData.studyRunId
          ? "Import complete. The extension export was attached to the current webcam study run."
          : storedPreviewCount < confusionCaptures.length
          ? `Import complete. Saved the session, but only ${storedPreviewCount} of ${confusionCaptures.length} screenshot previews were kept locally to fit browser storage.`
          : "Import complete. Saved as the current extension session."
      );

      if (redirectTo) {
        window.setTimeout(() => {
          router.push(redirectTo);
        }, 450);
      }
    } catch (error) {
      console.error(error);
      setStatus(
        isQuotaExceededError(error)
          ? "Import failed because the browser storage quota was exceeded."
          : error instanceof SyntaxError
            ? "Import failed. The file is not valid JSON."
            : "Import failed. Check the console for details."
      );
      setSummary("");
    } finally {
      event.target.value = "";
    }
  }

  function clearImport() {
    removeStoredValue(STORAGE_KEYS.extensionLast);
    setStatus("Cleared imported extension data.");
    setSummary("");
  }

  return (
    <section
      className={`panel space-y-4 ${
        highlight ? "border-[#0f3d3e]/60 ring-2 ring-[#0f3d3e]/30 shadow-[0_0_0_6px_rgba(15,61,62,0.08)]" : ""
      }`}
    >
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">{eyebrow}</p>
          {stepNumber ? (
            <span className="rounded-full bg-[#0f3d3e] px-4 py-1.5 text-sm font-bold text-white">
              Step {stepNumber}
            </span>
          ) : null}
        </div>
        <h2 className={`${compact ? "text-lg" : "text-xl"} font-semibold text-slate-950`}>{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </div>
      <input
        type="file"
        accept="application/json"
        onChange={onFile}
        className={`block w-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#0f3d3e] file:px-5 file:py-2.5 file:text-base file:text-white hover:file:bg-[#12484a] ${
          highlight ? "file:font-extrabold" : "file:font-semibold"
        }`}
      />
      <p className="text-sm text-slate-600">{status}</p>
      <div className="flex flex-wrap gap-3">
        {showDashboardLink ? (
          <Link className="button-primary" href="/dashboard">
            Go to Dashboard
          </Link>
        ) : null}
        {showHistoryLink ? (
          <Link className="button-secondary" href="/history">
            View History
          </Link>
        ) : null}
        <button className="button-secondary" onClick={clearImport} type="button">
          Clear Import
        </button>
      </div>
      {summary ? (
        <pre className="whitespace-pre-wrap rounded-2xl bg-slate-950/5 p-4 text-sm text-slate-700">
          {summary}
        </pre>
      ) : null}
    </section>
  );
}
