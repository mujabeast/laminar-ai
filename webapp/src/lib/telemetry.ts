import type { StudyMode, StudySetup } from "@/lib/studyos";
export type StudyVisibilityState = "visible" | "hidden";
export type PostureLabel = "upright-focused" | "slouching" | "unknown";

export type HeadPose = {
  pitch: number;
  yaw: number;
  roll: number;
};

export type TelemetrySample = {
  ts: number;
  facePresent: boolean;
  phoneDetected: boolean;
  visibilityState: StudyVisibilityState;
  attentionLikely: boolean;
  eyeClosure: number;
  perclosClosed: boolean;
  blinkScore: number;
  blinkEvent: boolean;
  headPose: HeadPose;
  browFurrow: number;
  jawClench: number;
  posture: PostureLabel;
  shoulderTilt: number | null;
};

export type VisibilityEvent = {
  ts: number;
  state: StudyVisibilityState;
};

export type PostureBreakdown = {
  uprightPct: number;
  slouchPct: number;
  unknownPct: number;
};

export type ScreenFrameSample = {
  id: string;
  ts: number;
  dataUrl: string;
  width: number;
  height: number;
  note?: string;
};

export type TopicHotspot = {
  label: string;
  explanation: string;
};

export type SignificantEventKind =
  | "jaw-clench"
  | "phone-distraction"
  | "confusion-spike"
  | "head-drift"
  | "visibility-break"
  | "fatigue-spike";

export type SignificantEvent = {
  id: string;
  ts: number;
  kind: SignificantEventKind;
  title: string;
  detail: string;
  severity: number;
  screenFrameId?: string | null;
};

export type EventCorrelation = {
  event_label: string;
  visible_on_screen: string;
  visible_text_quote: string;
  interpretation: string;
};

export type TelemetrySummary = {
  sampleCount: number;
  totalSeconds: number;
  attentionRate: number;
  facePresenceRate: number;
  lookAwaySpikes: number;
  phoneDetectionRate: number;
  phoneDetectionEvents: number;
  visibilityLossCount: number;
  hiddenSeconds: number;
  visibleSeconds: number;
  perclos: number;
  blinkRatePerMinute: number;
  averageHeadPose: HeadPose;
  averageHeadDeviation: HeadPose;
  maxHeadDeviation: HeadPose;
  attentionFractureCount: number;
  browFurrowRate: number;
  jawClenchRate: number;
  postureBreakdown: PostureBreakdown;
  fatigueRisk: number;
  cognitiveLoadIndex: number;
  screenFrameCount: number;
};

export type DiagnosticReport = {
  createdAt: number;
  primary_behavior_label: string;
  efficiency_score: number;
  cognitive_state_summary: string;
  optimization_tips: string[];
  screen_correlation_summary?: string;
  topic_hotspots?: TopicHotspot[];
  event_correlations?: EventCorrelation[];
};

export type WebcamSession = {
  sessionId: string;
  studyRunId?: string;
  createdAt: number;
  totalSeconds: number;
  studyMode: StudyMode;
  samples: TelemetrySample[];
  visibilityEvents: VisibilityEvent[];
  screenFrames: ScreenFrameSample[];
  summary: TelemetrySummary;
  diagnosticReport?: DiagnosticReport | null;
  setupSnapshot?: StudySetup | null;
};

export type AttentionReportRecord = {
  id: string;
  studyRunId?: string | null;
  createdAt: number;
  setupSnapshot: StudySetup | null;
  webcamSessionId?: string;
  moduleName: string;
  topic: string;
  studyMode: StudyMode;
  score: number;
  attentionRate: number;
  lookAwaySpikes: number;
  totalSeconds: number;
  phoneDetectionRate: number;
  phoneDetectionEvents: number;
  visibilityLossCount: number;
  hiddenSeconds: number;
  perclos: number;
  blinkRatePerMinute: number;
  attentionFractureCount: number;
  browFurrowRate: number;
  jawClenchRate: number;
  slouchRate: number;
  goalAchieved: boolean;
  badgeLabel: string | null;
  fusionMode: string;
  reportText: string;
  cognitiveStateSummary: string;
  optimizationTips: string[];
  screenCorrelationSummary: string;
  topicHotspots: TopicHotspot[];
  eventCorrelations: EventCorrelation[];
};

const LOOK_AWAY_THRESHOLD_MS = 2000;
const HEAD_DEVIATION_THRESHOLD_DEG = 18;
const HEAD_FRACTURE_HOLD_MS = 900;
const BROW_FURROW_THRESHOLD = 0.35;
const JAW_CLENCH_THRESHOLD = 0.42;

function getBadgeLabelForGuard(guardStyle: StudySetup["guardStyle"]) {
  if (guardStyle === "lock-in") return "Lock-In Legend";
  if (guardStyle === "casual") return "Steady Runner";
  return "Baseline Logged";
}

function getLocalGuardThresholdProfile(guardStyle: StudySetup["guardStyle"] | undefined) {
  if (guardStyle === "lock-in") {
    return {
      phoneEvents: 1,
      visibilityLossCount: 1,
      lookAwaySpikes: 1,
      slouchRate: 0.18,
      jawClenchRate: 0.18,
      browFurrowRate: 0.18,
      perclos: 0.2,
      maxYaw: 14,
      minSessionSecondsForSuccess: 90,
    };
  }

  if (guardStyle === "casual") {
    return {
      phoneEvents: 2,
      visibilityLossCount: 2,
      lookAwaySpikes: 2,
      slouchRate: 0.32,
      jawClenchRate: 0.28,
      browFurrowRate: 0.28,
      perclos: 0.28,
      maxYaw: 22,
      minSessionSecondsForSuccess: 90,
    };
  }

  return {
    phoneEvents: Number.POSITIVE_INFINITY,
    visibilityLossCount: Number.POSITIVE_INFINITY,
    lookAwaySpikes: Number.POSITIVE_INFINITY,
    slouchRate: Number.POSITIVE_INFINITY,
    jawClenchRate: Number.POSITIVE_INFINITY,
    browFurrowRate: Number.POSITIVE_INFINITY,
    perclos: Number.POSITIVE_INFINITY,
    maxYaw: Number.POSITIVE_INFINITY,
    minSessionSecondsForSuccess: 60,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isTopicHotspotLike(value: unknown): value is TopicHotspot {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<TopicHotspot>;
  return typeof candidate.label === "string" && typeof candidate.explanation === "string";
}

function isEventCorrelationLike(value: unknown): value is EventCorrelation {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<EventCorrelation>;
  return (
    typeof candidate.event_label === "string" &&
    typeof candidate.visible_on_screen === "string" &&
    typeof candidate.visible_text_quote === "string" &&
    typeof candidate.interpretation === "string"
  );
}

function getAverageSampleIntervalMs(samples: TelemetrySample[]) {
  if (samples.length < 2) return 250;

  let total = 0;
  for (let index = 1; index < samples.length; index += 1) {
    total += Math.max(1, samples[index].ts - samples[index - 1].ts);
  }
  return total / (samples.length - 1);
}

export function isDiagnosticReportLike(value: unknown): value is DiagnosticReport {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<DiagnosticReport>;
  return (
    typeof candidate.createdAt === "number" &&
    typeof candidate.primary_behavior_label === "string" &&
    typeof candidate.efficiency_score === "number" &&
    typeof candidate.cognitive_state_summary === "string" &&
    Array.isArray(candidate.optimization_tips) &&
    candidate.optimization_tips.every((entry) => typeof entry === "string") &&
    (candidate.screen_correlation_summary === undefined ||
      typeof candidate.screen_correlation_summary === "string") &&
    (candidate.topic_hotspots === undefined ||
      (Array.isArray(candidate.topic_hotspots) &&
        candidate.topic_hotspots.every((entry) => isTopicHotspotLike(entry)))) &&
    (candidate.event_correlations === undefined ||
      (Array.isArray(candidate.event_correlations) &&
        candidate.event_correlations.every((entry) => isEventCorrelationLike(entry))))
  );
}

export function isTelemetrySampleLike(value: unknown): value is TelemetrySample {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<TelemetrySample>;
  return (
    typeof candidate.ts === "number" &&
    typeof candidate.facePresent === "boolean" &&
    typeof candidate.phoneDetected === "boolean" &&
    (candidate.visibilityState === "visible" || candidate.visibilityState === "hidden") &&
    typeof candidate.attentionLikely === "boolean" &&
    typeof candidate.eyeClosure === "number" &&
    typeof candidate.perclosClosed === "boolean" &&
    typeof candidate.blinkScore === "number" &&
    typeof candidate.blinkEvent === "boolean" &&
    !!candidate.headPose &&
    typeof candidate.headPose.pitch === "number" &&
    typeof candidate.headPose.yaw === "number" &&
    typeof candidate.headPose.roll === "number" &&
    typeof candidate.browFurrow === "number" &&
    typeof candidate.jawClench === "number" &&
    (candidate.posture === "upright-focused" ||
      candidate.posture === "slouching" ||
      candidate.posture === "unknown")
  );
}

export function isScreenFrameSampleLike(value: unknown): value is ScreenFrameSample {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<ScreenFrameSample>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.ts === "number" &&
    typeof candidate.dataUrl === "string" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    (candidate.note === undefined || typeof candidate.note === "string")
  );
}

export function isVisibilityEventLike(value: unknown): value is VisibilityEvent {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<VisibilityEvent>;
  return (
    typeof candidate.ts === "number" &&
    (candidate.state === "visible" || candidate.state === "hidden")
  );
}

export function isTelemetrySummaryLike(value: unknown): value is TelemetrySummary {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<TelemetrySummary>;
  return (
    typeof candidate.sampleCount === "number" &&
    typeof candidate.totalSeconds === "number" &&
    typeof candidate.attentionRate === "number" &&
    typeof candidate.facePresenceRate === "number" &&
    typeof candidate.lookAwaySpikes === "number" &&
    typeof candidate.phoneDetectionRate === "number" &&
    typeof candidate.phoneDetectionEvents === "number" &&
    typeof candidate.visibilityLossCount === "number" &&
    typeof candidate.hiddenSeconds === "number" &&
    typeof candidate.visibleSeconds === "number" &&
    typeof candidate.perclos === "number" &&
    typeof candidate.blinkRatePerMinute === "number" &&
    !!candidate.averageHeadPose &&
    typeof candidate.averageHeadPose.pitch === "number" &&
    !!candidate.averageHeadDeviation &&
    typeof candidate.averageHeadDeviation.yaw === "number" &&
    !!candidate.maxHeadDeviation &&
    typeof candidate.maxHeadDeviation.roll === "number" &&
    typeof candidate.attentionFractureCount === "number" &&
    typeof candidate.browFurrowRate === "number" &&
    typeof candidate.jawClenchRate === "number" &&
    !!candidate.postureBreakdown &&
    typeof candidate.postureBreakdown.uprightPct === "number" &&
    typeof candidate.postureBreakdown.slouchPct === "number" &&
    typeof candidate.postureBreakdown.unknownPct === "number" &&
    typeof candidate.fatigueRisk === "number" &&
    typeof candidate.cognitiveLoadIndex === "number" &&
    typeof candidate.screenFrameCount === "number"
  );
}

export function isWebcamSessionLike(value: unknown): value is WebcamSession {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<WebcamSession>;
  return (
    typeof candidate.sessionId === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.totalSeconds === "number" &&
    typeof candidate.studyMode === "string" &&
    Array.isArray(candidate.samples) &&
    candidate.samples.every((entry) => isTelemetrySampleLike(entry)) &&
    Array.isArray(candidate.visibilityEvents) &&
    candidate.visibilityEvents.every((entry) => isVisibilityEventLike(entry)) &&
    Array.isArray(candidate.screenFrames) &&
    candidate.screenFrames.every((entry) => isScreenFrameSampleLike(entry)) &&
    isTelemetrySummaryLike(candidate.summary) &&
    (candidate.diagnosticReport === undefined ||
      candidate.diagnosticReport === null ||
      isDiagnosticReportLike(candidate.diagnosticReport))
  );
}

export function isAttentionReportRecordLike(value: unknown): value is AttentionReportRecord {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AttentionReportRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.moduleName === "string" &&
    typeof candidate.topic === "string" &&
    typeof candidate.studyMode === "string" &&
    typeof candidate.score === "number" &&
    typeof candidate.attentionRate === "number" &&
    typeof candidate.lookAwaySpikes === "number" &&
    typeof candidate.totalSeconds === "number" &&
    typeof candidate.phoneDetectionRate === "number" &&
    typeof candidate.phoneDetectionEvents === "number" &&
    typeof candidate.visibilityLossCount === "number" &&
    typeof candidate.hiddenSeconds === "number" &&
    typeof candidate.perclos === "number" &&
    typeof candidate.blinkRatePerMinute === "number" &&
    typeof candidate.attentionFractureCount === "number" &&
    typeof candidate.browFurrowRate === "number" &&
    typeof candidate.jawClenchRate === "number" &&
    typeof candidate.slouchRate === "number" &&
    typeof candidate.goalAchieved === "boolean" &&
    typeof candidate.fusionMode === "string" &&
    typeof candidate.reportText === "string" &&
    typeof candidate.cognitiveStateSummary === "string" &&
    Array.isArray(candidate.optimizationTips) &&
    typeof candidate.screenCorrelationSummary === "string" &&
    Array.isArray(candidate.topicHotspots) &&
    candidate.topicHotspots.every((entry) => isTopicHotspotLike(entry)) &&
    Array.isArray(candidate.eventCorrelations) &&
    candidate.eventCorrelations.every((entry) => isEventCorrelationLike(entry))
  );
}

export function countLookAwaySpikes(samples: TelemetrySample[], thresholdMs = LOOK_AWAY_THRESHOLD_MS) {
  let spikes = 0;
  let absentStart: number | null = null;

  for (const sample of samples) {
    if (!sample.attentionLikely) {
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

export function detectLateCrash(samples: TelemetrySample[]) {
  if (samples.length < 90) return false;

  const third = Math.floor(samples.length / 3);
  const first = samples.slice(0, third);
  const last = samples.slice(samples.length - third);
  const firstRate = first.filter((sample) => sample.attentionLikely).length / first.length;
  const lastRate = last.filter((sample) => sample.attentionLikely).length / last.length;

  return firstRate - lastRate >= 0.2;
}

function computeHiddenSeconds(args: {
  visibilityEvents: VisibilityEvent[];
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
}) {
  const { visibilityEvents, sessionStartedAt, sessionEndedAt } = args;
  if (!sessionStartedAt || !sessionEndedAt || sessionEndedAt <= sessionStartedAt) return 0;

  const events = visibilityEvents
    .slice()
    .sort((left, right) => left.ts - right.ts)
    .filter((entry) => entry.ts >= sessionStartedAt && entry.ts <= sessionEndedAt);

  let hiddenStart: number | null = null;
  let hiddenMs = 0;

  for (const event of events) {
    if (event.state === "hidden") {
      hiddenStart = hiddenStart ?? event.ts;
      continue;
    }

    if (hiddenStart !== null) {
      hiddenMs += Math.max(0, event.ts - hiddenStart);
      hiddenStart = null;
    }
  }

  if (hiddenStart !== null) {
    hiddenMs += Math.max(0, sessionEndedAt - hiddenStart);
  }

  return hiddenMs / 1000;
}

function findNearestScreenFrameId(ts: number, screenFrames: ScreenFrameSample[]) {
  if (!screenFrames.length) return null;

  let bestFrame: ScreenFrameSample | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const frame of screenFrames) {
    const distance = Math.abs(frame.ts - ts);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFrame = frame;
    }
  }

  return bestDistance <= 7000 ? bestFrame?.id ?? null : null;
}

function pushSignificantEvent(args: {
  events: SignificantEvent[];
  lastByKind: Map<SignificantEventKind, number>;
  screenFrames: ScreenFrameSample[];
  ts: number;
  kind: SignificantEventKind;
  title: string;
  detail: string;
  severity: number;
  cooldownMs?: number;
}) {
  const {
    events,
    lastByKind,
    screenFrames,
    ts,
    kind,
    title,
    detail,
    severity,
    cooldownMs = 5000,
  } = args;
  const lastTs = lastByKind.get(kind) ?? 0;
  if (ts - lastTs < cooldownMs) return;

  lastByKind.set(kind, ts);
  events.push({
    id: crypto.randomUUID(),
    ts,
    kind,
    title,
    detail,
    severity: round(severity, 3),
    screenFrameId: findNearestScreenFrameId(ts, screenFrames),
  });
}

export function deriveSignificantEvents(args: {
  samples: TelemetrySample[];
  visibilityEvents: VisibilityEvent[];
  screenFrames?: ScreenFrameSample[];
}) {
  const { samples, visibilityEvents, screenFrames = [] } = args;
  const events: SignificantEvent[] = [];
  const lastByKind = new Map<SignificantEventKind, number>();

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const headDrift = Math.max(
      Math.abs(sample.headPose.pitch),
      Math.abs(sample.headPose.yaw),
      Math.abs(sample.headPose.roll)
    );
    const recentWindow = samples.slice(Math.max(0, index - 8), index + 1);
    const recentPerclosRate = recentWindow.length
      ? recentWindow.filter((entry) => entry.perclosClosed).length / recentWindow.length
      : 0;

    if (sample.phoneDetected) {
      pushSignificantEvent({
        events,
        lastByKind,
        screenFrames,
        ts: sample.ts,
        kind: "phone-distraction",
        title: "Phone entered the study frame",
        detail: `Phone presence coincided with ${Math.round(headDrift)} degrees of head drift and ${
          sample.attentionLikely ? "continued" : "reduced"
        } focus continuity.`,
        severity: 0.86,
      });
    }

    if (sample.jawClench >= 0.56) {
      pushSignificantEvent({
        events,
        lastByKind,
        screenFrames,
        ts: sample.ts,
        kind: "jaw-clench",
        title: "Jaw clench spike",
        detail: `Jaw clench reached ${Math.round(sample.jawClench * 100)}% while brow furrowing sat at ${Math.round(
          sample.browFurrow * 100
        )}%.`,
        severity: sample.jawClench,
      });
    }

    if (sample.browFurrow >= 0.46) {
      pushSignificantEvent({
        events,
        lastByKind,
        screenFrames,
        ts: sample.ts,
        kind: "confusion-spike",
        title: "Confusion cue spike",
        detail: `Brow furrowing rose to ${Math.round(sample.browFurrow * 100)}% with jaw tension at ${Math.round(
          sample.jawClench * 100
        )}%.`,
        severity: sample.browFurrow,
      });
    }

    if (headDrift >= HEAD_DEVIATION_THRESHOLD_DEG + 4) {
      pushSignificantEvent({
        events,
        lastByKind,
        screenFrames,
        ts: sample.ts,
        kind: "head-drift",
        title: "Head-pose drift spike",
        detail: `Pitch, yaw, and roll peaked around ${Math.round(Math.abs(sample.headPose.pitch))}/${Math.round(
          Math.abs(sample.headPose.yaw)
        )}/${Math.round(Math.abs(sample.headPose.roll))} degrees.`,
        severity: clamp(headDrift / 30, 0, 1),
      });
    }

    if (recentPerclosRate >= 0.55) {
      pushSignificantEvent({
        events,
        lastByKind,
        screenFrames,
        ts: sample.ts,
        kind: "fatigue-spike",
        title: "Fatigue spike",
        detail: `Recent eye-closure rate rose to ${Math.round(recentPerclosRate * 100)}% with blink score at ${Math.round(
          sample.blinkScore * 100
        )}%.`,
        severity: recentPerclosRate,
      });
    }
  }

  for (const event of visibilityEvents) {
    if (event.state !== "hidden") continue;

    pushSignificantEvent({
      events,
      lastByKind,
      screenFrames,
      ts: event.ts,
      kind: "visibility-break",
      title: "Visibility break",
      detail: "The study page lost visibility, which usually marks a context switch or task disengagement.",
      severity: 0.82,
      cooldownMs: 3500,
    });
  }

  return events
    .sort((left, right) => right.severity - left.severity || left.ts - right.ts)
    .slice(0, 6)
    .sort((left, right) => left.ts - right.ts);
}

function computeAttentionFractureCount(samples: TelemetrySample[]) {
  let count = 0;
  let fractureStart: number | null = null;

  for (const sample of samples) {
    const deviation = Math.max(
      Math.abs(sample.headPose.pitch),
      Math.abs(sample.headPose.yaw),
      Math.abs(sample.headPose.roll)
    );
    const fractured = sample.facePresent && deviation >= HEAD_DEVIATION_THRESHOLD_DEG;

    if (fractured) {
      fractureStart = fractureStart ?? sample.ts;
      continue;
    }

    if (fractureStart !== null && sample.ts - fractureStart >= HEAD_FRACTURE_HOLD_MS) {
      count += 1;
    }

    fractureStart = null;
  }

  return count;
}

export function computeTelemetrySummary(args: {
  samples: TelemetrySample[];
  visibilityEvents: VisibilityEvent[];
  screenFrames?: ScreenFrameSample[];
  totalSeconds: number;
}) {
  const { samples, visibilityEvents, screenFrames = [], totalSeconds } = args;
  const sampleCount = samples.length;
  const sessionStartedAt = samples[0]?.ts ?? null;
  const sessionEndedAt = samples[samples.length - 1]?.ts ?? null;
  const faceSamples = samples.filter((sample) => sample.facePresent);
  const attentiveSamples = samples.filter((sample) => sample.attentionLikely);
  const intervalMs = getAverageSampleIntervalMs(samples);

  const visibilityLossCount = visibilityEvents.filter((event) => event.state === "hidden").length;
  const hiddenSeconds = computeHiddenSeconds({
    visibilityEvents,
    sessionStartedAt,
    sessionEndedAt,
  });
  const visibleSeconds = Math.max(0, totalSeconds - hiddenSeconds);
  const lookAwaySpikes = countLookAwaySpikes(samples);
  const phoneDetectionEvents = samples.filter((sample) => sample.phoneDetected).length;
  const blinkCount = samples.filter((sample) => sample.blinkEvent).length;

  const averageHeadPose = {
    pitch: round(average(samples.map((sample) => sample.headPose.pitch)), 2),
    yaw: round(average(samples.map((sample) => sample.headPose.yaw)), 2),
    roll: round(average(samples.map((sample) => sample.headPose.roll)), 2),
  };

  const averageHeadDeviation = {
    pitch: round(average(samples.map((sample) => Math.abs(sample.headPose.pitch))), 2),
    yaw: round(average(samples.map((sample) => Math.abs(sample.headPose.yaw))), 2),
    roll: round(average(samples.map((sample) => Math.abs(sample.headPose.roll))), 2),
  };

  const maxHeadDeviation = {
    pitch: round(Math.max(0, ...samples.map((sample) => Math.abs(sample.headPose.pitch))), 2),
    yaw: round(Math.max(0, ...samples.map((sample) => Math.abs(sample.headPose.yaw))), 2),
    roll: round(Math.max(0, ...samples.map((sample) => Math.abs(sample.headPose.roll))), 2),
  };

  const uprightCount = samples.filter((sample) => sample.posture === "upright-focused").length;
  const slouchCount = samples.filter((sample) => sample.posture === "slouching").length;
  const unknownCount = samples.filter((sample) => sample.posture === "unknown").length;
  const denominator = Math.max(sampleCount, 1);

  const attentionRate = sampleCount ? attentiveSamples.length / sampleCount : 0;
  const facePresenceRate = sampleCount ? faceSamples.length / sampleCount : 0;
  const perclos = faceSamples.length
    ? faceSamples.filter((sample) => sample.perclosClosed).length / faceSamples.length
    : 0;
  const blinkRatePerMinute =
    totalSeconds > 0 ? round(blinkCount / Math.max(totalSeconds / 60, 0.5), 2) : 0;
  const browFurrowRate = sampleCount
    ? samples.filter((sample) => sample.browFurrow >= BROW_FURROW_THRESHOLD).length / sampleCount
    : 0;
  const jawClenchRate = sampleCount
    ? samples.filter((sample) => sample.jawClench >= JAW_CLENCH_THRESHOLD).length / sampleCount
    : 0;

  return {
    sampleCount,
    totalSeconds,
    attentionRate: round(attentionRate),
    facePresenceRate: round(facePresenceRate),
    lookAwaySpikes,
    phoneDetectionRate: round(phoneDetectionEvents / denominator),
    phoneDetectionEvents,
    visibilityLossCount,
    hiddenSeconds: round(hiddenSeconds, 1),
    visibleSeconds: round(visibleSeconds, 1),
    perclos: round(perclos),
    blinkRatePerMinute,
    averageHeadPose,
    averageHeadDeviation,
    maxHeadDeviation,
    attentionFractureCount: computeAttentionFractureCount(samples),
    browFurrowRate: round(browFurrowRate),
    jawClenchRate: round(jawClenchRate),
    postureBreakdown: {
      uprightPct: round(uprightCount / denominator),
      slouchPct: round(slouchCount / denominator),
      unknownPct: round(unknownCount / denominator),
    },
    fatigueRisk: round(
      clamp(
        perclos * 0.56 +
          Math.max(0, 18 - blinkRatePerMinute) / 18 * 0.16 +
          (slouchCount / denominator) * 0.16 +
          Math.min(phoneDetectionEvents / Math.max(sampleCount, 1), 0.12),
        0,
        1
      )
    ),
    cognitiveLoadIndex: round(
      clamp((browFurrowRate * 0.55 + jawClenchRate * 0.45) * (1 + intervalMs / 5000), 0, 1)
    ),
    screenFrameCount: screenFrames.length,
  } satisfies TelemetrySummary;
}

export function deriveFallbackDiagnostic(args: {
  setup: StudySetup | null;
  summary: TelemetrySummary;
}): DiagnosticReport {
  const { setup, summary } = args;

  let label = "Steady Focus";
  if (
    summary.visibilityLossCount >= 3 ||
    summary.lookAwaySpikes >= getLocalGuardThresholdProfile(setup?.guardStyle).lookAwaySpikes
  ) {
    label = "Unsteady Focus";
  } else if (summary.phoneDetectionRate >= 0.08) {
    label = "Split Attention";
  } else if (summary.perclos >= 0.34) {
    label = "Fatigued Drift";
  } else if (summary.browFurrowRate >= 0.32 && summary.attentionRate >= 0.7) {
    label = "Stuck But Engaged";
  } else if (summary.jawClenchRate >= 0.28) {
    label = "Pressure Build-Up";
  }

  const scoreBase =
    summary.attentionRate * 100 -
    summary.lookAwaySpikes * 2 -
    summary.visibilityLossCount * 4 -
    summary.phoneDetectionEvents * 3 -
    summary.perclos * 25 -
    summary.attentionFractureCount * 2;

  const score = Math.max(0, Math.min(100, Math.round(scoreBase)));
  const summaryText =
    label === "Fatigued Drift"
      ? "The student stayed present for much of the session, but fatigue markers and posture drift suggest their focus quality softened over time."
      : label === "Stuck But Engaged"
        ? "The student stayed with the material, but repeated confusion cues suggest real effort without clean conceptual fluency yet."
        : label === "Pressure Build-Up"
          ? "The student kept going, but stress cues built up enough to risk inefficient, tense studying."
          : label === "Unsteady Focus"
            ? "The session was repeatedly interrupted by attention dropouts, context breaks, or unstable head-position drift."
            : label === "Split Attention"
              ? "Phone presence repeatedly competed with the study block, so the student's attention was divided even when they stayed in frame."
            : "The student stayed reasonably stable through the session with manageable fatigue and distraction signals.";

  const tips = [
    summary.perclos >= 0.28
      ? "Use a shorter next block or a deliberate 60-second reset before fatigue compounds."
      : "Keep the next block the same length and preserve the same study posture setup.",
    summary.browFurrowRate >= 0.28
      ? "When confusion cues rise, pause to restate the exact sub-problem before continuing."
      : "Keep using short written checkpoints so attention stays anchored to one concrete target.",
    summary.visibilityLossCount >= 2 || summary.lookAwaySpikes >= 3
      ? "Reduce external interruptions for the next run and treat every visibility break as a reset trigger."
      : "Preserve the current environment because the session continuity was mostly intact.",
    summary.phoneDetectionRate >= 0.08
      ? "Keep the phone out of frame and out of reach so the next session stays single-threaded."
      : "Keep the device layout unchanged if the current setup already feels low-friction.",
  ];

  return {
    createdAt: Date.now(),
    primary_behavior_label: label,
    efficiency_score: score,
    cognitive_state_summary: summaryText,
    optimization_tips: tips,
  } satisfies DiagnosticReport;
}

export function buildAttentionReportText(args: {
  setup: StudySetup | null;
  summary: TelemetrySummary;
  diagnostic: DiagnosticReport | null | undefined;
}) {
  const { setup, summary, diagnostic } = args;
  const label = diagnostic?.primary_behavior_label ?? deriveFallbackDiagnostic(args).primary_behavior_label;
  const score = diagnostic?.efficiency_score ?? deriveFallbackDiagnostic(args).efficiency_score;

  const lines: string[] = [];

  if (setup) {
    lines.push(
      `${setup.studentName} worked on ${setup.moduleName} (${setup.topic}) in ${setup.studyMode.replace(/-/g, " ")} mode for ${Math.round(summary.totalSeconds / 60)} minutes.`
    );
  }

  lines.push(
    `Laminar.AI logged ${pct(summary.attentionRate)} attention continuity, ${summary.lookAwaySpikes} look-away spikes, ${summary.visibilityLossCount} context break(s), ${summary.phoneDetectionEvents} phone-present sample(s), and an efficiency score of ${score}.`
  );
  lines.push(
    `Fatigue markers showed ${pct(summary.perclos)} PERCLOS with ${summary.blinkRatePerMinute} blinks per minute.`
  );
  lines.push(
    `Head-pose drift produced ${summary.attentionFractureCount} attention fracture(s), while confusion/stress cues landed at ${pct(summary.browFurrowRate)} brow furrowing and ${pct(summary.jawClenchRate)} jaw clenching.`
  );
  lines.push(`Overall pattern: ${label}.`);

  return lines.join(" ");
}

export function createAttentionReportRecord(args: {
  setup: StudySetup | null;
  webcam: WebcamSession;
}) {
  const { setup, webcam } = args;
  const summary = webcam.summary;
  const diagnostic = webcam.diagnosticReport ?? deriveFallbackDiagnostic({ setup, summary });
  const thresholds = getLocalGuardThresholdProfile(setup?.guardStyle);
  const headDriftPeak = Math.max(
    summary.maxHeadDeviation.pitch,
    summary.maxHeadDeviation.yaw,
    summary.maxHeadDeviation.roll
  );
  const goalAchieved =
    webcam.totalSeconds >= thresholds.minSessionSecondsForSuccess &&
    summary.phoneDetectionEvents <= thresholds.phoneEvents &&
    summary.visibilityLossCount <= thresholds.visibilityLossCount &&
    summary.lookAwaySpikes <= thresholds.lookAwaySpikes &&
    summary.postureBreakdown.slouchPct <= thresholds.slouchRate &&
    summary.jawClenchRate <= thresholds.jawClenchRate &&
    summary.browFurrowRate <= thresholds.browFurrowRate &&
    summary.perclos <= thresholds.perclos &&
    headDriftPeak <= thresholds.maxYaw;

  return {
    id: webcam.studyRunId ?? webcam.sessionId,
    studyRunId: webcam.studyRunId ?? null,
    createdAt: webcam.createdAt,
    setupSnapshot: setup,
    webcamSessionId: webcam.sessionId,
    moduleName: setup?.moduleName || "Unspecified module",
    topic: setup?.topic || "Unspecified topic",
    studyMode: webcam.studyMode,
    score: diagnostic.efficiency_score,
    attentionRate: summary.attentionRate,
    lookAwaySpikes: summary.lookAwaySpikes,
    totalSeconds: webcam.totalSeconds,
    phoneDetectionRate: summary.phoneDetectionRate,
    phoneDetectionEvents: summary.phoneDetectionEvents,
    visibilityLossCount: summary.visibilityLossCount,
    hiddenSeconds: summary.hiddenSeconds,
    perclos: summary.perclos,
    blinkRatePerMinute: summary.blinkRatePerMinute,
    attentionFractureCount: summary.attentionFractureCount,
    browFurrowRate: summary.browFurrowRate,
    jawClenchRate: summary.jawClenchRate,
    slouchRate: summary.postureBreakdown.slouchPct,
    goalAchieved,
    badgeLabel: goalAchieved && setup ? getBadgeLabelForGuard(setup.guardStyle) : null,
    fusionMode: diagnostic.primary_behavior_label,
    reportText: buildAttentionReportText({
      setup,
      summary,
      diagnostic,
    }),
    cognitiveStateSummary: diagnostic.cognitive_state_summary,
    optimizationTips: diagnostic.optimization_tips,
    screenCorrelationSummary:
      diagnostic.screen_correlation_summary ?? "No screen-share correlation was available for this run.",
    topicHotspots: diagnostic.topic_hotspots ?? [],
    eventCorrelations: diagnostic.event_correlations ?? [],
  } satisfies AttentionReportRecord;
}

