const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_BASE_URL = (
  process.env.OPENAI_BASE_URL ||
  process.env.AZURE_OPENAI_BASE_URL ||
  DEFAULT_OPENAI_BASE_URL
).replace(/\/$/, "");
const OPENAI_API_URL = `${OPENAI_BASE_URL}/responses`;
const DEFAULT_MODEL = process.env.OPENAI_RESPONSES_MODEL || "gpt-4.1-mini";
const INPUT_COST_PER_1M_TOKENS = Number(process.env.OPENAI_INPUT_COST_PER_1M_TOKENS || 0);
const OUTPUT_COST_PER_1M_TOKENS = Number(process.env.OPENAI_OUTPUT_COST_PER_1M_TOKENS || 0);

type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
};

type OpenAIUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
};

type StudySetupLike = {
  studentName?: string;
  moduleName?: string;
  topic?: string;
  focusDomain?: string;
  targetMinutes?: number;
  maxLookAwaySpikes?: number;
  guardStyle?: string;
} | null;

type SampleLike = {
  ts: number;
  facePresent: boolean;
  phonePresent?: boolean;
};

type WebcamSessionLike = {
  totalSeconds?: number;
  samples?: SampleLike[];
} | null;

type AttentionReportLike = {
  studyRunId?: string | null;
  createdAt: number;
  moduleName: string;
  topic: string;
  score: number;
  attentionRate: number;
  lookAwaySpikes: number;
  totalSeconds: number;
  awaySwitches: number | null;
  goalAchieved: boolean;
  fusionMode: string;
  switchRate: number;
  lateCrash: boolean;
  frictionClusterCount: number;
  helperMinutes: number;
  sedativeMinutes: number;
  frictionToHelper: number;
  frictionToSedative: number;
};

function requireApiKey() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return apiKey;
}

function isAzureOpenAIBaseUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith(".openai.azure.com") || hostname.endsWith(".services.ai.azure.com");
  } catch {
    return false;
  }
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractUsage(payload: Record<string, unknown>): OpenAIUsage {
  const usage = payload.usage;

  if (!usage || typeof usage !== "object") {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
    };
  }

  const typedUsage = usage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
  };
  const inputTokens = numberOrNull(typedUsage.input_tokens);
  const outputTokens = numberOrNull(typedUsage.output_tokens);
  const totalTokens = numberOrNull(typedUsage.total_tokens);
  const canEstimate =
    inputTokens !== null &&
    outputTokens !== null &&
    INPUT_COST_PER_1M_TOKENS > 0 &&
    OUTPUT_COST_PER_1M_TOKENS > 0;

  const estimatedCostUsd = canEstimate
    ? Number(
        (
          (inputTokens / 1_000_000) * INPUT_COST_PER_1M_TOKENS +
          (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M_TOKENS
        ).toFixed(6)
      )
    : null;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
  };
}

function logUsage(args: {
  operation: string;
  model: string;
  schemaName: string;
  usage: OpenAIUsage;
}) {
  console.info("[Laminar.AI]", {
    operation: args.operation,
    model: args.model,
    schema: args.schemaName,
    inputTokens: args.usage.inputTokens,
    outputTokens: args.usage.outputTokens,
    totalTokens: args.usage.totalTokens,
    estimatedCostUsd: args.usage.estimatedCostUsd,
  });
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatMinutesSeconds(totalSeconds: number) {
  const normalized = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${minutes} min ${seconds} sec`;
}

function countLookAwaySpikes(samples: SampleLike[], thresholdMs = 2000) {
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

function isSampleAttentive(sample: SampleLike) {
  return sample.facePresent && !sample.phonePresent;
}

function detectLateCrash(samples: SampleLike[]) {
  if (samples.length < 90) return false;

  const third = Math.floor(samples.length / 3);
  const first = samples.slice(0, third);
  const last = samples.slice(samples.length - third);
  const firstRate = first.filter(isSampleAttentive).length / first.length;
  const lastRate = last.filter(isSampleAttentive).length / last.length;

  return firstRate - lastRate >= 0.25;
}

function computeProfileMetrics(args: {
  setup: StudySetupLike;
  webcam: WebcamSessionLike;
}) {
  const samples = args.webcam?.samples ?? [];
  const totalSeconds = Number(args.webcam?.totalSeconds ?? 0);
  const attention = samples.length
    ? samples.filter(isSampleAttentive).length / samples.length
    : 0;
  const lookAwaySpikes = samples.length ? countLookAwaySpikes(samples, 2000) : 0;
  const lateCrash = samples.length ? detectLateCrash(samples) : false;

  let fusionMode = "Deep Worker";
  if (samples.length && attention < 0.55) fusionMode = "Seat-Leaver";
  else if (lateCrash) fusionMode = "Late Crasher";
  else if (lookAwaySpikes >= Math.max(4, args.setup?.maxLookAwaySpikes ?? 4)) {
    fusionMode = "Unsteady Focus";
  }

  const base = samples.length ? attention * 100 : 70;
  const penalty = lookAwaySpikes * 2 + (lateCrash ? 10 : 0);

  return {
    totalSeconds,
    attention,
    lookAwaySpikes,
    lateCrash,
    switchRate: 0,
    awaySwitches: null,
    frictionClusters: [],
    timeByType: null,
    fusionMode,
    score: Math.max(0, Math.min(100, Math.round(base - penalty))),
    frictionToHelper: 0,
    frictionToSedative: 0,
    topDomains: [],
  };
}

function extractTextFromResponse(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const textParts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? ((item as { content: unknown[] }).content ?? [])
      : [];

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") {
        textParts.push(text);
      }
    }
  }

  return textParts.join("\n").trim();
}

export async function callOpenAIJson<T>(args: {
  input: unknown[];
  schema: JsonSchema;
  model?: string;
  operation?: string;
}) {
  const model = args.model || DEFAULT_MODEL;
  const isAzureOpenAI = isAzureOpenAIBaseUrl(OPENAI_BASE_URL);
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      ...(isAzureOpenAI
        ? { "api-key": requireApiKey() }
        : { Authorization: `Bearer ${requireApiKey()}` }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: args.input,
      text: {
        format: {
          type: "json_schema",
          name: args.schema.name,
          schema: args.schema.schema,
          strict: true,
        },
      },
    }),
  });

  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const message =
      typeof payload.error === "object" &&
      payload.error &&
      typeof (payload.error as { message?: unknown }).message === "string"
        ? (payload.error as { message: string }).message
        : "OpenAI request failed.";
    throw new Error(message);
  }

  const text = extractTextFromResponse(payload);
  if (!text) {
    throw new Error("OpenAI response did not contain JSON output.");
  }

  logUsage({
    operation: args.operation || args.schema.name,
    model,
    schemaName: args.schema.name,
    usage: extractUsage(payload),
  });

  return JSON.parse(text) as T;
}

export function buildProfileContext(args: {
  setup: StudySetupLike;
  webcam: WebcamSessionLike;
}) {
  const metrics = computeProfileMetrics(args);

  return {
    setup: args.setup
      ? {
          studentName: args.setup.studentName,
          moduleName: args.setup.moduleName,
          topic: args.setup.topic,
          focusDomain: args.setup.focusDomain,
          targetMinutes: args.setup.targetMinutes,
          maxLookAwaySpikes: args.setup.maxLookAwaySpikes,
          guardStyle: args.setup.guardStyle,
        }
      : null,
    session: {
      duration: formatMinutesSeconds(metrics.totalSeconds),
      attention: pct(metrics.attention),
      lookAwaySpikes: metrics.lookAwaySpikes,
      lateCrash: metrics.lateCrash,
      frictionClusterCount: metrics.frictionClusters.length,
      fusionMode: metrics.fusionMode,
      score: metrics.score,
    },
  };
}

export function buildTrendContext(reports: AttentionReportLike[]) {
  return reports.map((report) => ({
    studyRunId: report.studyRunId,
    createdAt: new Date(report.createdAt).toISOString(),
    moduleName: report.moduleName,
    topic: report.topic,
    score: report.score,
    attentionRate: Number((report.attentionRate * 100).toFixed(1)),
    lookAwaySpikes: report.lookAwaySpikes,
    totalMinutes: Math.round(report.totalSeconds / 60),
    awaySwitches: report.awaySwitches,
    goalAchieved: report.goalAchieved,
    fusionMode: report.fusionMode,
    switchRate: Number(report.switchRate.toFixed(2)),
    lateCrash: report.lateCrash,
    frictionClusterCount: report.frictionClusterCount,
    helperMinutes: report.helperMinutes,
    sedativeMinutes: report.sedativeMinutes,
    frictionToHelper: report.frictionToHelper,
    frictionToSedative: report.frictionToSedative,
  }));
}
