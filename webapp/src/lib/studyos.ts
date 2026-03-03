import { useSyncExternalStore } from "react";

export const STORAGE_KEYS = {
  attentionLast: "studyos_attention_last",
  attentionHistory: "studyos_attention_history",
  extensionLast: "studyos_extension_last",
  extensionHistory: "studyos_extension_history",
  studySetupCurrent: "studyos_study_setup_current",
  studyRunCurrent: "studyos_study_run_current",
  reportHistory: "studyos_report_history",
  aiConfusionByRun: "studyos_ai_confusion_by_run",
  aiProfileByRun: "studyos_ai_profile_by_run",
  aiTrendsLast: "studyos_ai_trends_last",
  aiAcademicOverview: "studyos_ai_academic_overview",
  understandingChecklist: "studyos_understanding_checklist",
  understandingSessions: "studyos_understanding_sessions",
} as const;

export const PROFILE_STORAGE_KEYS = {
  profiles: "studyos_profiles",
  currentProfileId: "studyos_current_profile_id",
} as const;

const STORAGE_EVENT_NAME = "studyos-storage-change";
const PROFILE_STORAGE_PREFIX = "studyos_profile";
const GLOBAL_STORAGE_KEYS = new Set<string>(Object.values(PROFILE_STORAGE_KEYS));
const storageSnapshotCache = new Map<string, { raw: string | null; value: unknown }>();

export type StudyGuardStyle = "noob" | "lock-in";

export type UserProfile = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type StudySetup = {
  id: string;
  studentName: string;
  moduleName: string;
  topic: string;
  focusDomain: string;
  targetMinutes: number;
  maxTabSwitches: number;
  maxLookAwaySpikes: number;
  guardStyle: StudyGuardStyle;
  createdAt: number;
};

export type StudyRunRecord = {
  studyRunId: string;
  createdAt: number;
  updatedAt: number;
  setupId: string | null;
  setupSnapshot: StudySetup | null;
  webcamSessionId: string | null;
  extensionSessionId: string | null;
  webcamCompletedAt: number | null;
  extensionCompletedAt: number | null;
};

export type Sample = {
  ts: number;
  facePresent: boolean;
  phonePresent?: boolean;
};

export type WebcamSession = {
  sessionId: string;
  studyRunId?: string;
  createdAt: number;
  totalSeconds: number;
  samples: Sample[];
  setupSnapshot?: StudySetup | null;
};

export type TabEventType =
  | "recording_start"
  | "recording_stop"
  | "tab_activated"
  | "tab_navigated";

export type TabEvent = {
  ts: number;
  type: TabEventType;
  tabId?: number;
  url?: string;
  domain?: string;
};

export type TabSpan = {
  startTs: number;
  endTs: number;
  durationMs: number;
  domain?: string;
  url?: string;
  tabId?: number;
  reason?: "start" | "activation" | "navigation";
};

export type VideoEventType = "pause" | "play" | "seeking" | "seeked" | "ratechange";

export type VideoEvent = {
  ts: number;
  type: VideoEventType;
  currentTime?: number | null;
  playbackRate?: number | null;
  url?: string;
  domain?: string;
};

export type ConfusionCapture = {
  id: string;
  ts: number;
  url?: string;
  domain?: string;
  title?: string;
  screenshotDataUrl?: string;
};

export type ExtensionSession = {
  sessionId?: string;
  studyRunId?: string;
  startedAt?: number;
  endedAt?: number;
  tabEvents?: TabEvent[];
  tabSpans?: TabSpan[];
  confusionCaptures?: ConfusionCapture[];
  setupSnapshot?: StudySetup | null;
};

export type ExtensionHistoryEntry = ExtensionSession & {
  importedAt: number;
  filename: string;
};

export type GoalEvaluation = {
  durationMet: boolean;
  faceMet: boolean;
  tabMet: boolean | null;
  pendingTabData: boolean;
  achieved: boolean;
  remainingFaceMisses: number;
  remainingTabSwitches: number | null;
  badgeLabel: string | null;
};

export type AttentionReportRecord = {
  id: string;
  studyRunId?: string | null;
  createdAt: number;
  setupSnapshot: StudySetup | null;
  webcamSessionId?: string;
  extensionSessionId?: string;
  moduleName: string;
  topic: string;
  score: number;
  attentionRate: number;
  lookAwaySpikes: number;
  totalSeconds: number;
  awaySwitches: number | null;
  tabGoalPending: boolean;
  goalAchieved: boolean;
  badgeLabel: string | null;
  fusionMode: string;
  reportText: string;
  confusionCount: number;
  switchRate: number;
  lateCrash: boolean;
  frictionClusterCount: number;
  helperMinutes: number;
  sedativeMinutes: number;
  frictionToHelper: number;
  frictionToSedative: number;
};

export type ConfusionCaptureInsight = {
  captureId: string;
  title: string;
  visibleContent?: string;
  explanation: string;
  likelyTask: string;
  confusionType: string;
  nextStep: string;
  confidence: "low" | "medium" | "high";
};

export type ConfusionAnalysisRecord = {
  studyRunId: string;
  createdAt: number;
  summary: string;
  captures: ConfusionCaptureInsight[];
};

export type ProfileAnalysisRecord = {
  studyRunId: string;
  createdAt: number;
  profileLabel: string;
  summary: string;
  attentionPattern: string;
  behaviorPattern: string;
  strengths: string[];
  risks: string[];
  nextExperiment: string;
};

export type TrendAnalysisRecord = {
  createdAt: number;
  windowSize: number;
  trendLabel: "improving" | "stuck" | "burnout" | "unstable";
  summary: string;
  strongestPredictors: string[];
  nextWeekExperiment: string;
};

export type UnderstandingChecklistState = Record<
  string,
  {
    understood: boolean;
    updatedAt: number;
  }
>;

export type UnderstandingMaterial = {
  id: string;
  name: string;
  type: string;
  size: number;
  textExcerpt?: string;
  storedAs: "text-excerpt" | "metadata-only";
};

export type UnderstandingChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
};

export type UnderstandingWeakness = {
  id: string;
  title: string;
  explanation: string;
  createdAt: number;
};

export type UnderstandingSessionRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  studentName: string;
  topic: string;
  confusionText: string;
  skillContext: string;
  uploads: UnderstandingMaterial[];
  chat: UnderstandingChatMessage[];
  weaknesses: UnderstandingWeakness[];
};

export type AcademicMergedTopic = {
  id: string;
  label: string;
  aliases: string[];
  itemIds: string[];
};

export type AcademicOverviewRecord = {
  createdAt: number;
  itemCount: number;
  mergedTopics: AcademicMergedTopic[];
  weakVsCareless: string;
  trajectory: string;
  limitedTimeFocus: string[];
  repeatedStruggleReason: string;
};

export type FusionMetrics = {
  samples: Sample[];
  totalSeconds: number;
  tabSpans: TabSpan[];
  tabEvents: TabEvent[];
  confusionCaptures: ConfusionCapture[];
  attention: number;
  lookAwaySpikes: number;
  lateCrash: boolean;
  switchRate: number;
  awaySwitches: number | null;
  timeByType: ReturnType<typeof sumTimeByType> | null;
  topDomains: ReturnType<typeof summarizeDomainDurations> | null;
  fusionMode: string;
  score: number;
  goalEvaluation: GoalEvaluation | null;
};

export type ResolvedStudyRun = {
  studyRunId: string | null;
  webcam: WebcamSession | null;
  extensionSession: ExtensionSession | null;
  setup: StudySetup | null;
};

export function parseStoredJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getCurrentProfileIdFromStorage() {
  if (typeof window === "undefined") return null;

  const value = parseStoredJson<string | null>(
    localStorage.getItem(PROFILE_STORAGE_KEYS.currentProfileId),
    null
  );
  return value?.trim() ? value : null;
}

function resolveStorageKey(key: string) {
  if (GLOBAL_STORAGE_KEYS.has(key)) return key;

  const profileId = getCurrentProfileIdFromStorage();
  return `${PROFILE_STORAGE_PREFIX}:${profileId ?? "anon"}:${key}`;
}

function readCachedStoredValueAtKey<T>(
  storageKey: string,
  fallback: T,
  validator?: (value: unknown) => value is T
) {
  const raw = localStorage.getItem(storageKey);
  const cached = storageSnapshotCache.get(storageKey);

  if (cached && cached.raw === raw) {
    const cachedValue = cached.value;
    if (validator && !validator(cachedValue)) return fallback;
    return cachedValue as T;
  }

  const parsed = parseStoredJson<unknown>(raw, fallback);
  const nextValue = validator && !validator(parsed) ? fallback : parsed;
  storageSnapshotCache.set(storageKey, { raw, value: nextValue });
  return nextValue as T;
}

function readCachedStoredValue<T>(
  key: string,
  fallback: T,
  validator?: (value: unknown) => value is T
) {
  return readCachedStoredValueAtKey(resolveStorageKey(key), fallback, validator);
}

function subscribeToStorage(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(STORAGE_EVENT_NAME, handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(STORAGE_EVENT_NAME, handler);
  };
}

function emitStorageChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STORAGE_EVENT_NAME));
}

export function setStoredJson<T>(key: string, value: T) {
  const storageKey = resolveStorageKey(key);
  localStorage.setItem(storageKey, JSON.stringify(value));
  storageSnapshotCache.set(storageKey, {
    raw: localStorage.getItem(storageKey),
    value,
  });
  emitStorageChange();
}

export function removeStoredValue(key: string) {
  const storageKey = resolveStorageKey(key);
  localStorage.removeItem(storageKey);
  storageSnapshotCache.set(storageKey, {
    raw: null,
    value: null,
  });
  emitStorageChange();
}

export function getStoredJson<T>(
  key: string,
  fallback: T,
  validator?: (value: unknown) => value is T
) {
  if (typeof window === "undefined") return fallback;
  return readCachedStoredValue(key, fallback, validator);
}

function getUnscopedStoredJson<T>(
  key: string,
  fallback: T,
  validator?: (value: unknown) => value is T
) {
  if (typeof window === "undefined") return fallback;
  return readCachedStoredValueAtKey(key, fallback, validator);
}

export function useStoredJson<T>(
  key: string,
  fallback: T,
  validator?: (value: unknown) => value is T
) {
  return useSyncExternalStore(
    subscribeToStorage,
    () => readCachedStoredValue(key, fallback, validator),
    () => fallback
  );
}

export function isUserProfileLike(value: unknown): value is UserProfile {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<UserProfile>;
  return typeof candidate.id === "string" && typeof candidate.name === "string";
}

export function getStoredProfiles() {
  return getUnscopedStoredJson<UserProfile[]>(
    PROFILE_STORAGE_KEYS.profiles,
    [],
    (value): value is UserProfile[] =>
      Array.isArray(value) && value.every((entry) => isUserProfileLike(entry))
  );
}

export function useStoredProfiles() {
  return useSyncExternalStore(
    subscribeToStorage,
    () =>
      getUnscopedStoredJson<UserProfile[]>(
        PROFILE_STORAGE_KEYS.profiles,
        [],
        (value): value is UserProfile[] =>
          Array.isArray(value) && value.every((entry) => isUserProfileLike(entry))
      ),
    () => []
  );
}

export function getCurrentProfileId() {
  return getUnscopedStoredJson<string | null>(
    PROFILE_STORAGE_KEYS.currentProfileId,
    null,
    (value): value is string | null => value === null || typeof value === "string"
  );
}

export function useCurrentProfileId() {
  return useSyncExternalStore(
    subscribeToStorage,
    () =>
      getUnscopedStoredJson<string | null>(
        PROFILE_STORAGE_KEYS.currentProfileId,
        null,
        (value): value is string | null => value === null || typeof value === "string"
      ),
    () => null
  );
}

export function setCurrentProfile(profileId: string | null) {
  if (typeof window === "undefined") return;

  if (profileId) {
    localStorage.setItem(PROFILE_STORAGE_KEYS.currentProfileId, JSON.stringify(profileId));
    storageSnapshotCache.set(PROFILE_STORAGE_KEYS.currentProfileId, {
      raw: localStorage.getItem(PROFILE_STORAGE_KEYS.currentProfileId),
      value: profileId,
    });
  } else {
    localStorage.removeItem(PROFILE_STORAGE_KEYS.currentProfileId);
    storageSnapshotCache.set(PROFILE_STORAGE_KEYS.currentProfileId, {
      raw: null,
      value: null,
    });
  }

  emitStorageChange();
}

export function createOrSwitchProfile(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Name is required.");
  }

  const normalized = trimmed.toLowerCase();
  const profiles = getStoredProfiles();
  const existing = profiles.find((profile) => profile.name.trim().toLowerCase() === normalized);

  if (existing) {
    const nextExisting = {
      ...existing,
      updatedAt: Date.now(),
    };
    const nextProfiles = profiles.map((profile) =>
      profile.id === nextExisting.id ? nextExisting : profile
    );

    localStorage.setItem(PROFILE_STORAGE_KEYS.profiles, JSON.stringify(nextProfiles));
    storageSnapshotCache.set(PROFILE_STORAGE_KEYS.profiles, {
      raw: localStorage.getItem(PROFILE_STORAGE_KEYS.profiles),
      value: nextProfiles,
    });
    setCurrentProfile(nextExisting.id);
    return nextExisting;
  }

  const createdAt = Date.now();
  const profile: UserProfile = {
    id: crypto.randomUUID(),
    name: trimmed,
    createdAt,
    updatedAt: createdAt,
  };
  const nextProfiles = [profile, ...profiles].sort((left, right) => right.updatedAt - left.updatedAt);

  localStorage.setItem(PROFILE_STORAGE_KEYS.profiles, JSON.stringify(nextProfiles));
  storageSnapshotCache.set(PROFILE_STORAGE_KEYS.profiles, {
    raw: localStorage.getItem(PROFILE_STORAGE_KEYS.profiles),
    value: nextProfiles,
  });
  setCurrentProfile(profile.id);
  return profile;
}

export function getCurrentProfile() {
  const currentProfileId = getCurrentProfileId();
  if (!currentProfileId) return null;
  return getStoredProfiles().find((profile) => profile.id === currentProfileId) ?? null;
}

export function useCurrentProfile() {
  const profiles = useStoredProfiles();
  const currentProfileId = useCurrentProfileId();
  return profiles.find((profile) => profile.id === currentProfileId) ?? null;
}

export function isStudySetupLike(value: unknown): value is StudySetup {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<StudySetup>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.studentName === "string" &&
    typeof candidate.moduleName === "string" &&
    typeof candidate.topic === "string" &&
    typeof candidate.focusDomain === "string"
  );
}

export function isStudyRunRecordLike(value: unknown): value is StudyRunRecord {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<StudyRunRecord>;
  return typeof candidate.studyRunId === "string" && typeof candidate.createdAt === "number";
}

export function isExtensionSessionLike(value: unknown): value is ExtensionSession {
  if (!value || typeof value !== "object") return false;

  const candidate = value as ExtensionSession;
  return (
    Array.isArray(candidate.tabEvents) ||
    Array.isArray(candidate.tabSpans) ||
    Array.isArray(candidate.confusionCaptures)
  );
}

export function isUnderstandingMaterialLike(value: unknown): value is UnderstandingMaterial {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<UnderstandingMaterial>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.size === "number"
  );
}

export function isUnderstandingMessageLike(value: unknown): value is UnderstandingChatMessage {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<UnderstandingChatMessage>;
  return (
    typeof candidate.id === "string" &&
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.text === "string"
  );
}

export function isUnderstandingWeaknessLike(value: unknown): value is UnderstandingWeakness {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<UnderstandingWeakness>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.explanation === "string"
  );
}

export function isUnderstandingSessionLike(value: unknown): value is UnderstandingSessionRecord {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<UnderstandingSessionRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.studentName === "string" &&
    typeof candidate.topic === "string" &&
    typeof candidate.confusionText === "string" &&
    typeof candidate.skillContext === "string" &&
    Array.isArray(candidate.uploads) &&
    candidate.uploads.every((entry) => isUnderstandingMaterialLike(entry)) &&
    Array.isArray(candidate.chat) &&
    candidate.chat.every((entry) => isUnderstandingMessageLike(entry)) &&
    Array.isArray(candidate.weaknesses) &&
    candidate.weaknesses.every((entry) => isUnderstandingWeaknessLike(entry))
  );
}

export function isAcademicMergedTopicLike(value: unknown): value is AcademicMergedTopic {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AcademicMergedTopic>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    Array.isArray(candidate.aliases) &&
    candidate.aliases.every((entry) => typeof entry === "string") &&
    Array.isArray(candidate.itemIds) &&
    candidate.itemIds.every((entry) => typeof entry === "string")
  );
}

export function isAcademicOverviewRecordLike(value: unknown): value is AcademicOverviewRecord {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AcademicOverviewRecord>;
  return (
    typeof candidate.createdAt === "number" &&
    typeof candidate.itemCount === "number" &&
    Array.isArray(candidate.mergedTopics) &&
    candidate.mergedTopics.every((entry) => isAcademicMergedTopicLike(entry)) &&
    typeof candidate.weakVsCareless === "string" &&
    typeof candidate.trajectory === "string" &&
    Array.isArray(candidate.limitedTimeFocus) &&
    candidate.limitedTimeFocus.every((entry) => typeof entry === "string") &&
    typeof candidate.repeatedStruggleReason === "string"
  );
}

export function createUnderstandingSessionRecord(args: {
  studentName: string;
  topic: string;
  confusionText: string;
  skillContext: string;
  uploads: UnderstandingMaterial[];
}): UnderstandingSessionRecord {
  const ts = Date.now();

  return {
    id: crypto.randomUUID(),
    createdAt: ts,
    updatedAt: ts,
    studentName: args.studentName.trim(),
    topic: args.topic.trim(),
    confusionText: args.confusionText.trim(),
    skillContext: args.skillContext.trim(),
    uploads: args.uploads,
    chat: [],
    weaknesses: [],
  };
}

export function mergeUnderstandingWeaknesses(
  existing: UnderstandingWeakness[],
  incoming: Array<Omit<UnderstandingWeakness, "id" | "createdAt">>
) {
  const byKey = new Map<string, UnderstandingWeakness>();

  for (const item of existing) {
    byKey.set(item.title.trim().toLowerCase(), item);
  }

  for (const item of incoming) {
    const key = item.title.trim().toLowerCase();
    const previous = byKey.get(key);
    byKey.set(key, {
      id: previous?.id ?? `weak_${hashString(`${item.title}:${item.explanation}`)}`,
      createdAt: previous?.createdAt ?? Date.now(),
      title: item.title.trim(),
      explanation: item.explanation.trim(),
    });
  }

  return [...byKey.values()].sort((left, right) => right.createdAt - left.createdAt);
}

export function buildStudyRunId() {
  return `run_${Date.now()}_${crypto.randomUUID()}`;
}

export function createStudyRunRecord(
  setup: StudySetup | null,
  studyRunId = buildStudyRunId()
): StudyRunRecord {
  const ts = Date.now();
  return {
    studyRunId,
    createdAt: ts,
    updatedAt: ts,
    setupId: setup?.id ?? null,
    setupSnapshot: setup,
    webcamSessionId: null,
    extensionSessionId: null,
    webcamCompletedAt: null,
    extensionCompletedAt: null,
  };
}

export function getStoredStudyRun() {
  if (typeof window === "undefined") return null;

  return readCachedStoredValue<StudyRunRecord | null>(
    STORAGE_KEYS.studyRunCurrent,
    null,
    (value): value is StudyRunRecord | null => value === null || isStudyRunRecordLike(value)
  );
}

export function startFreshStudyRun(setup: StudySetup | null) {
  const run = createStudyRunRecord(setup);
  setStoredJson(STORAGE_KEYS.studyRunCurrent, run);
  syncStudyRunToExtension(run);
  return run;
}

export function upsertCurrentStudyRun(args: {
  setup?: StudySetup | null;
  studyRunId?: string | null;
  webcamSessionId?: string | null;
  webcamCompletedAt?: number | null;
  extensionSessionId?: string | null;
  extensionCompletedAt?: number | null;
}) {
  const current = getStoredStudyRun();
  const studyRunId = args.studyRunId ?? current?.studyRunId ?? buildStudyRunId();
  const base =
    current && current.studyRunId === studyRunId
      ? current
      : createStudyRunRecord(args.setup ?? current?.setupSnapshot ?? null, studyRunId);

  const next: StudyRunRecord = {
    ...base,
    updatedAt: Date.now(),
    setupId: (args.setup ?? base.setupSnapshot)?.id ?? base.setupId,
    setupSnapshot: args.setup ?? base.setupSnapshot,
    webcamSessionId: args.webcamSessionId ?? base.webcamSessionId,
    webcamCompletedAt: args.webcamCompletedAt ?? base.webcamCompletedAt,
    extensionSessionId: args.extensionSessionId ?? base.extensionSessionId,
    extensionCompletedAt: args.extensionCompletedAt ?? base.extensionCompletedAt,
  };

  setStoredJson(STORAGE_KEYS.studyRunCurrent, next);
  syncStudyRunToExtension(next);
  return next;
}

export function syncStudyRunToExtension(run: StudyRunRecord | null) {
  if (typeof window === "undefined" || !run) return;

  window.postMessage(
    {
      source: "studyos-webapp",
      type: "STUDYOS_SYNC_RUN",
      payload: {
        studyRunId: run.studyRunId,
        setupSnapshot: run.setupSnapshot,
        syncedAt: Date.now(),
      },
    },
    window.location.origin
  );
}

export function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function splitMs(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  return splitSeconds(totalSeconds);
}

export function splitSeconds(totalSeconds: number) {
  const normalized = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return { minutes, seconds };
}

export function formatMinutesSeconds(totalSeconds: number) {
  const { minutes, seconds } = splitSeconds(totalSeconds);
  return `${minutes} min ${seconds} sec`;
}

export function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

export function normalizeFocusDomain(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";

  try {
    const withProtocol = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

export function normalizeGuardStyle(input: string | null | undefined): StudyGuardStyle {
  if (input === "lock-in" || input === "strict") return "lock-in";
  return "noob";
}

export function isSampleAttentive(sample: Sample) {
  return sample.facePresent && !sample.phonePresent;
}

export function sameDayKey(ts: number) {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function countLookAwaySpikes(samples: Sample[], thresholdMs = 2000) {
  let spikes = 0;
  let absentStart: number | null = null;

  for (const sample of samples) {
    if (!isSampleAttentive(sample)) {
      if (absentStart === null) absentStart = sample.ts;
      continue;
    }

    if (absentStart !== null && sample.ts - absentStart >= thresholdMs) {
      spikes += 1;
    }

    absentStart = null;
  }

  return spikes;
}

export function detectLateCrash(samples: Sample[]) {
  if (samples.length < 90) return false;

  const third = Math.floor(samples.length / 3);
  const first = samples.slice(0, third);
  const last = samples.slice(samples.length - third);
  const firstRate = first.filter(isSampleAttentive).length / first.length;
  const lastRate = last.filter(isSampleAttentive).length / last.length;

  return firstRate - lastRate >= 0.25;
}

export function domainType(domain: string) {
  const normalized = domain.toLowerCase();

  if (
    normalized.includes("netflix") ||
    normalized.includes("tiktok") ||
    normalized.includes("instagram") ||
    normalized.includes("youtube.com/shorts") ||
    normalized.includes("facebook") ||
    normalized.includes("x.com") ||
    normalized.includes("twitter") ||
    normalized.includes("reddit") ||
    normalized.includes("twitch")
  ) {
    return "sedative" as const;
  }

  if (
    normalized.includes("chat.openai.com") ||
    normalized.includes("chatgpt") ||
    normalized.includes("claude") ||
    normalized.includes("perplexity") ||
    normalized.includes("stack") ||
    normalized.includes("github") ||
    normalized.includes("docs") ||
    normalized.includes("wikipedia") ||
    normalized.includes("geeksforgeeks")
  ) {
    return "helper" as const;
  }

  if (
    normalized.includes("ntu") ||
    normalized.includes("ntulearn") ||
    normalized.includes("canvas") ||
    normalized.includes("blackboard") ||
    normalized.includes("coursera") ||
    normalized.includes("edx") ||
    normalized.includes("khanacademy") ||
    normalized.includes("youtube")
  ) {
    return "study" as const;
  }

  return "other" as const;
}

export function computeSwitchRate(tabEvents: TabEvent[], tabSpans: TabSpan[]) {
  const totalMs = tabSpans.reduce((sum, span) => sum + (span.durationMs || 0), 0);
  if (totalMs <= 0) return 0;

  const switches =
    tabEvents.filter((event) => event.type === "tab_activated").length ||
    Math.max(0, tabSpans.length - 1);

  return switches / (totalMs / 600_000);
}

export function summarizeDomainDurations(tabSpans: TabSpan[]) {
  const totals: Record<string, number> = {};

  for (const span of tabSpans) {
    const domain = (span.domain || "unknown").toLowerCase();
    totals[domain] = (totals[domain] ?? 0) + (span.durationMs || 0);
  }

  const top = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, durationMs]) => ({
      domain,
      durationMs,
      ...splitMs(durationMs),
    }));

  return { totals, top };
}

export function sumTimeByType(tabSpans: TabSpan[]) {
  let sedativeMs = 0;
  let helperMs = 0;
  let studyMs = 0;
  let otherMs = 0;

  for (const span of tabSpans) {
    const durationMs = span.durationMs || 0;
    const type = domainType((span.domain || "unknown").toLowerCase());

    if (type === "sedative") sedativeMs += durationMs;
    else if (type === "helper") helperMs += durationMs;
    else if (type === "study") studyMs += durationMs;
    else otherMs += durationMs;
  }

  return {
    sedativeMs,
    helperMs,
    studyMs,
    otherMs,
    sedative: splitMs(sedativeMs),
    helper: splitMs(helperMs),
    study: splitMs(studyMs),
    other: splitMs(otherMs),
  };
}

export function domainMatchesFocus(domain: string, focusDomain: string) {
  const normalizedDomain = normalizeFocusDomain(domain);
  const normalizedFocus = normalizeFocusDomain(focusDomain);
  if (!normalizedFocus) return false;

  return (
    normalizedDomain === normalizedFocus ||
    normalizedDomain.endsWith(`.${normalizedFocus}`) ||
    normalizedFocus.endsWith(`.${normalizedDomain}`)
  );
}

export function countAwaySwitchesFromFocus(tabSpans: TabSpan[], focusDomain: string) {
  const normalizedFocus = normalizeFocusDomain(focusDomain);
  const spans = [...tabSpans].sort((a, b) => a.startTs - b.startTs);

  if (!spans.length) return normalizedFocus ? 0 : null;
  if (!normalizedFocus) return Math.max(0, spans.length - 1);

  let count = 0;

  for (let index = 0; index < spans.length - 1; index += 1) {
    const currentDomain = spans[index].domain || "";
    const nextDomain = spans[index + 1].domain || "";
    if (domainMatchesFocus(currentDomain, normalizedFocus) && !domainMatchesFocus(nextDomain, normalizedFocus)) {
      count += 1;
    }
  }

  return count;
}

export function countAwaySwitchActivations(
  tabEvents: TabEvent[],
  tabSpans: TabSpan[],
  focusDomain: string
) {
  const normalizedFocus = normalizeFocusDomain(focusDomain);

  if (tabEvents.length) {
    if (!normalizedFocus) {
      return tabEvents.filter((event) => event.type === "tab_activated").length;
    }

    return tabEvents.filter(
      (event) =>
        event.type === "tab_activated" &&
        !domainMatchesFocus(event.domain || "", normalizedFocus)
    ).length;
  }

  return countAwaySwitchesFromFocus(tabSpans, focusDomain);
}

export function getBadgeLabel(guardStyle: StudyGuardStyle) {
  return normalizeGuardStyle(guardStyle) === "lock-in" ? "Lock-In Legend" : "Momentum Builder";
}

export function evaluateGoals(
  setup: StudySetup | null,
  metrics: {
    totalSeconds: number;
    lookAwaySpikes: number;
    awaySwitches: number | null;
    hasTabData: boolean;
  }
): GoalEvaluation | null {
  if (!setup) return null;

  const durationMet = metrics.totalSeconds >= setup.targetMinutes * 60;
  const faceMet = metrics.lookAwaySpikes <= setup.maxLookAwaySpikes;
  const pendingTabData = !metrics.hasTabData;
  const tabMet = pendingTabData || metrics.awaySwitches === null
    ? null
    : metrics.awaySwitches <= setup.maxTabSwitches;
  const achieved = durationMet && faceMet && (tabMet ?? false);

  return {
    durationMet,
    faceMet,
    tabMet,
    pendingTabData,
    achieved,
    remainingFaceMisses: Math.max(0, setup.maxLookAwaySpikes - metrics.lookAwaySpikes),
    remainingTabSwitches:
      metrics.awaySwitches === null ? null : Math.max(0, setup.maxTabSwitches - metrics.awaySwitches),
    badgeLabel: achieved ? getBadgeLabel(setup.guardStyle) : null,
  };
}

export function buildAttentionReportText(args: {
  setup: StudySetup | null;
  metrics: FusionMetrics;
}) {
  const { setup, metrics } = args;
  const lines: string[] = [];

  if (setup) {
    lines.push(
      `${setup.studentName} studied ${setup.moduleName} (${setup.topic}) for ${formatMinutesSeconds(metrics.totalSeconds)}.`
    );
    lines.push(
      `The configured goals were ${setup.maxLookAwaySpikes} look-away spikes, ${setup.maxTabSwitches} tab exits from ${setup.focusDomain || "the main study context"}, and a ${setup.targetMinutes}-minute session.`
    );
  }

  lines.push(
    `Observed attention was ${pct(metrics.attention)} with ${metrics.lookAwaySpikes} look-away spikes and a focus score of ${metrics.score}.`
  );

  if (metrics.awaySwitches !== null) {
    lines.push(`The student left the focus site ${metrics.awaySwitches} times.`);
  } else {
    lines.push("Tab guard evaluation is pending because no extension session has been imported yet.");
  }

  lines.push(`Current study pattern is classified as ${metrics.fusionMode}.`);

  if (metrics.confusionCaptures.length > 0) {
    lines.push(
      `${metrics.confusionCaptures.length} confusion capture${metrics.confusionCaptures.length === 1 ? "" : "s"} were saved for later review.`
    );
  }

  if (metrics.goalEvaluation?.achieved) {
    lines.push(
      `All configured goals were met, so the student earned the ${metrics.goalEvaluation.badgeLabel} badge today.`
    );
  } else if (metrics.goalEvaluation) {
    const misses = [
      !metrics.goalEvaluation.durationMet ? "session duration target" : null,
      !metrics.goalEvaluation.faceMet ? "look-away guard" : null,
      metrics.goalEvaluation.tabMet === false ? "tab-switch guard" : null,
      metrics.goalEvaluation.pendingTabData ? "tab-switch data is still pending import" : null,
    ].filter(Boolean);

    if (misses.length) {
      lines.push(`Goals still open: ${misses.join(", ")}.`);
    }
  }

  return lines.join(" ");
}

export function computeFusionMetrics(args: {
  webcam: WebcamSession | null;
  extensionSession: ExtensionSession | null;
  setup: StudySetup | null;
}) {
  const { webcam, extensionSession, setup } = args;

  const samples: Sample[] = webcam?.samples ?? [];
  const totalSeconds = Number(webcam?.totalSeconds ?? 0);
  const tabSpans = extensionSession?.tabSpans ?? [];
  const tabEvents = extensionSession?.tabEvents ?? [];
  const confusionCaptures = extensionSession?.confusionCaptures ?? [];

  const attention = samples.length
    ? samples.filter(isSampleAttentive).length / samples.length
    : 0;
  const lookAwaySpikes = samples.length ? countLookAwaySpikes(samples, 2000) : 0;
  const lateCrash = samples.length ? detectLateCrash(samples) : false;
  const switchRate = tabSpans.length ? computeSwitchRate(tabEvents, tabSpans) : 0;
  const awaySwitches =
    tabSpans.length && setup
      ? countAwaySwitchActivations(tabEvents, tabSpans, setup.focusDomain)
      : null;
  const timeByType = tabSpans.length ? sumTimeByType(tabSpans) : null;
  const topDomains = tabSpans.length ? summarizeDomainDurations(tabSpans) : null;

  let fusionMode = "Deep Worker";

  if (switchRate >= 6) fusionMode = "Split Focus";
  if (lateCrash && switchRate >= 3) fusionMode = "Late Crasher";
  if (
    tabSpans.length &&
    (timeByType?.helperMs ?? 0) >= 180_000 &&
    (timeByType?.helperMs ?? 0) > (timeByType?.studyMs ?? 0) * 0.6
  ) {
    fusionMode = "Helper Reliant";
  }
  if (samples.length && attention < 0.65) fusionMode = "Seat-Leaver";

  const base = samples.length ? attention * 100 : 70;
  const sedativePenaltyMinutes = timeByType ? timeByType.sedativeMs / 60_000 : 0;
  const awaySwitchPenalty = awaySwitches ? awaySwitches * 2 : 0;
  const penalty =
    lookAwaySpikes * 2 +
    switchRate * 3 +
    awaySwitchPenalty +
    sedativePenaltyMinutes * 2 +
    (lateCrash ? 10 : 0);

  const goalEvaluation = evaluateGoals(setup, {
    totalSeconds,
    lookAwaySpikes,
    awaySwitches,
    hasTabData: tabSpans.length > 0,
  });

  const metrics: FusionMetrics = {
    samples,
    totalSeconds,
    tabSpans,
    tabEvents,
    confusionCaptures,
    attention,
    lookAwaySpikes,
    lateCrash,
    switchRate,
    awaySwitches,
    timeByType,
    topDomains,
    fusionMode,
    score: Math.max(0, Math.min(100, Math.round(base - penalty))),
    goalEvaluation,
  };

  return metrics;
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function getWebcamTimestamp(entry: WebcamSession | null) {
  return entry?.createdAt ?? 0;
}

function getExtensionTimestamp(entry: ExtensionSession | null) {
  return entry?.endedAt ?? entry?.startedAt ?? 0;
}

function setupsLikelyMatch(
  left: StudySetup | null | undefined,
  right: StudySetup | null | undefined
) {
  if (!left || !right) return false;

  if (left.id && right.id && left.id === right.id) {
    return true;
  }

  return (
    left.moduleName.trim().toLowerCase() === right.moduleName.trim().toLowerCase() &&
    left.topic.trim().toLowerCase() === right.topic.trim().toLowerCase() &&
    normalizeFocusDomain(left.focusDomain) === normalizeFocusDomain(right.focusDomain)
  );
}

export function resolveStudyRun(args: {
  currentRun: StudyRunRecord | null;
  currentSetup: StudySetup | null;
  webcamLast: WebcamSession | null;
  webcamHistory: WebcamSession[];
  extensionLast: ExtensionSession | null;
  extensionHistory: ExtensionHistoryEntry[];
}): ResolvedStudyRun {
  const webcamEntries = uniqueByKey(
    [args.webcamLast, ...args.webcamHistory].filter(Boolean) as WebcamSession[],
    (entry) => entry.sessionId
  ).sort((a, b) => getWebcamTimestamp(b) - getWebcamTimestamp(a));

  const extensionEntries = uniqueByKey(
    [args.extensionLast, ...args.extensionHistory].filter(Boolean) as ExtensionSession[],
    (entry) => entry.sessionId || `${entry.endedAt ?? entry.startedAt ?? 0}:${entry.studyRunId ?? "none"}`
  ).sort((a, b) => getExtensionTimestamp(b) - getExtensionTimestamp(a));

  const findBundle = (studyRunId: string | null): ResolvedStudyRun | null => {
    if (!studyRunId) return null;

    const webcam = webcamEntries.find((entry) => entry.studyRunId === studyRunId) ?? null;
    const extensionSession =
      extensionEntries.find((entry) => entry.studyRunId === studyRunId) ?? null;

    if (!webcam && !extensionSession) return null;

    return {
      studyRunId,
      webcam,
      extensionSession,
      setup:
        webcam?.setupSnapshot ??
        extensionSession?.setupSnapshot ??
        args.currentRun?.setupSnapshot ??
        args.currentSetup,
    };
  };

  const findNearbyWebcamForExtension = (extensionSession: ExtensionSession | null) => {
    if (!extensionSession) return null;

    const extensionTs = getExtensionTimestamp(extensionSession);
    if (!extensionTs) return null;

    return (
      webcamEntries.find((entry) => {
        const webcamTs = getWebcamTimestamp(entry);
        const isCloseInTime = Math.abs(webcamTs - extensionTs) <= 6 * 60 * 60 * 1000;

        return (
          isCloseInTime &&
          (
            setupsLikelyMatch(entry.setupSnapshot, extensionSession.setupSnapshot) ||
            setupsLikelyMatch(entry.setupSnapshot, args.currentRun?.setupSnapshot) ||
            setupsLikelyMatch(entry.setupSnapshot, args.currentSetup)
          )
        );
      }) ?? null
    );
  };

  const currentBundle = findBundle(args.currentRun?.studyRunId ?? null);
  if (currentBundle) {
    if (!currentBundle.webcam && currentBundle.extensionSession) {
      const bridgedWebcam = findNearbyWebcamForExtension(currentBundle.extensionSession);
      if (bridgedWebcam) {
        return {
          ...currentBundle,
          webcam: bridgedWebcam,
          setup: currentBundle.setup ?? bridgedWebcam.setupSnapshot ?? args.currentSetup,
        };
      }
    }

    return currentBundle;
  }

  const runIdsByRecency = uniqueByKey(
    [...webcamEntries, ...extensionEntries]
      .filter((entry) => entry.studyRunId)
      .sort((a, b) => {
        const left = "totalSeconds" in a ? getWebcamTimestamp(a) : getExtensionTimestamp(a);
        const right = "totalSeconds" in b ? getWebcamTimestamp(b as WebcamSession) : getExtensionTimestamp(b as ExtensionSession);
        return right - left;
      }),
    (entry) => entry.studyRunId || ""
  )
    .map((entry) => entry.studyRunId)
    .filter((value): value is string => Boolean(value));

  for (const studyRunId of runIdsByRecency) {
    const bundle = findBundle(studyRunId);
    if (bundle) return bundle;
  }

  const latestWebcam = webcamEntries[0] ?? null;
  const latestExtension = extensionEntries[0] ?? null;
  const webcamTs = getWebcamTimestamp(latestWebcam);
  const extensionTs = getExtensionTimestamp(latestExtension);

  if (webcamTs >= extensionTs && latestWebcam) {
    return {
      studyRunId: latestWebcam.studyRunId ?? null,
      webcam: latestWebcam,
      extensionSession:
        latestWebcam.studyRunId && latestExtension?.studyRunId === latestWebcam.studyRunId
          ? latestExtension
          : null,
      setup: latestWebcam.setupSnapshot ?? args.currentRun?.setupSnapshot ?? args.currentSetup,
    };
  }

  if (latestExtension) {
    const bridgedWebcam = findNearbyWebcamForExtension(latestExtension);
    return {
      studyRunId: latestExtension.studyRunId ?? null,
      webcam:
        (latestExtension.studyRunId && latestWebcam?.studyRunId === latestExtension.studyRunId
          ? latestWebcam
          : null) ?? bridgedWebcam,
      extensionSession: latestExtension,
      setup:
        latestExtension.setupSnapshot ??
        bridgedWebcam?.setupSnapshot ??
        args.currentRun?.setupSnapshot ??
        args.currentSetup,
    };
  }

  return {
    studyRunId: args.currentRun?.studyRunId ?? null,
    webcam: null,
    extensionSession: null,
    setup: args.currentRun?.setupSnapshot ?? args.currentSetup,
  };
}

export function createAttentionReportRecord(args: {
  setup: StudySetup | null;
  webcam: WebcamSession | null;
  extensionSession: ExtensionSession | null;
  metrics: FusionMetrics;
}) {
  const { setup, webcam, extensionSession, metrics } = args;
  const studyRunId = webcam?.studyRunId ?? extensionSession?.studyRunId ?? null;
  const id =
    studyRunId ??
    `${webcam?.sessionId || "webcam-none"}::${extensionSession?.sessionId || "extension-none"}`;

  const reportText = buildAttentionReportText({
    setup,
    metrics,
  });

  return {
    id,
    studyRunId,
    createdAt: Math.max(webcam?.createdAt ?? 0, extensionSession?.endedAt ?? 0, Date.now()),
    setupSnapshot: setup,
    webcamSessionId: webcam?.sessionId,
    extensionSessionId: extensionSession?.sessionId,
    moduleName: setup?.moduleName || "Unspecified module",
    topic: setup?.topic || "Unspecified topic",
    score: metrics.score,
    attentionRate: metrics.attention,
    lookAwaySpikes: metrics.lookAwaySpikes,
    totalSeconds: metrics.totalSeconds,
    awaySwitches: metrics.awaySwitches,
    tabGoalPending: metrics.goalEvaluation?.pendingTabData ?? true,
    goalAchieved: metrics.goalEvaluation?.achieved ?? false,
    badgeLabel: metrics.goalEvaluation?.badgeLabel ?? null,
    fusionMode: metrics.fusionMode,
    reportText,
    confusionCount: metrics.confusionCaptures.length,
    switchRate: metrics.switchRate,
    lateCrash: metrics.lateCrash,
    frictionClusterCount: 0,
    helperMinutes: Math.round((metrics.timeByType?.helperMs ?? 0) / 60_000),
    sedativeMinutes: Math.round((metrics.timeByType?.sedativeMs ?? 0) / 60_000),
    frictionToHelper: 0,
    frictionToSedative: 0,
  } satisfies AttentionReportRecord;
}

export function calculateDailyStreak(reportHistory: AttentionReportRecord[], anchorTs = Date.now()) {
  const achievedDays = new Set(
    reportHistory.filter((entry) => entry.goalAchieved).map((entry) => sameDayKey(entry.createdAt))
  );

  let streak = 0;
  const cursor = new Date(anchorTs);

  while (achievedDays.has(sameDayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
