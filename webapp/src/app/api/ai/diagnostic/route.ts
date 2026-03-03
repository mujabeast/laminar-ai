import { NextResponse } from "next/server";

import { callOpenAIJson } from "@/lib/ai";
import { type DiagnosticReport, deriveFallbackDiagnostic } from "@/lib/telemetry";

export const runtime = "nodejs";

const diagnosticSchema = {
  name: "laminar_ai_diagnostic_report",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "primary_behavior_label",
      "efficiency_score",
      "cognitive_state_summary",
      "optimization_tips",
      "screen_correlation_summary",
      "topic_hotspots",
      "event_correlations",
    ],
    properties: {
      primary_behavior_label: { type: "string" },
      efficiency_score: {
        type: "number",
        minimum: 0,
        maximum: 100,
      },
      cognitive_state_summary: { type: "string" },
      optimization_tips: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string" },
      },
      screen_correlation_summary: { type: "string" },
      topic_hotspots: {
        type: "array",
        minItems: 0,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "explanation"],
          properties: {
            label: { type: "string" },
            explanation: { type: "string" },
          },
        },
      },
      event_correlations: {
        type: "array",
        minItems: 0,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["event_label", "visible_on_screen", "interpretation", "visible_text_quote"],
          properties: {
            event_label: { type: "string" },
            visible_on_screen: { type: "string" },
            visible_text_quote: { type: "string" },
            interpretation: { type: "string" },
          },
        },
      },
    },
  },
} as const;

type RequestBody = {
  studyRunId?: string;
  setup?: {
    studentName?: string;
    moduleName?: string;
    topic?: string;
    studyMode?: string;
    focusDomain?: string;
    targetMinutes?: number;
    maxLookAwaySpikes?: number;
    guardStyle?: string;
  } | null;
  summary?: {
    sampleCount?: number;
    totalSeconds?: number;
    attentionRate?: number;
    facePresenceRate?: number;
    lookAwaySpikes?: number;
    visibilityLossCount?: number;
    hiddenSeconds?: number;
    visibleSeconds?: number;
    perclos?: number;
    blinkRatePerMinute?: number;
    averageHeadPose?: {
      pitch?: number;
      yaw?: number;
      roll?: number;
    };
    averageHeadDeviation?: {
      pitch?: number;
      yaw?: number;
      roll?: number;
    };
    maxHeadDeviation?: {
      pitch?: number;
      yaw?: number;
      roll?: number;
    };
    attentionFractureCount?: number;
    browFurrowRate?: number;
    jawClenchRate?: number;
    postureBreakdown?: {
      uprightPct?: number;
      slouchPct?: number;
      unknownPct?: number;
    };
    fatigueRisk?: number;
    cognitiveLoadIndex?: number;
    phoneDetectionRate?: number;
    phoneDetectionEvents?: number;
    screenFrameCount?: number;
  } | null;
  significantEvents?: Array<{
    id?: string;
    ts?: number;
    kind?: string;
    title?: string;
    detail?: string;
    severity?: number;
    screenFrameId?: string | null;
  }> | null;
  screenFrames?: Array<{
    id?: string;
    ts?: number;
    dataUrl?: string;
    note?: string;
  }> | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    if (!body.summary || typeof body.summary !== "object") {
      return NextResponse.json({ error: "summary is required." }, { status: 400 });
    }

    if (!body.setup || typeof body.setup !== "object") {
      return NextResponse.json({ error: "setup is required." }, { status: 400 });
    }

    const fallback = deriveFallbackDiagnostic({
      setup: body.setup as never,
      summary: body.summary as never,
    });

    const screenFrames = Array.isArray(body.screenFrames)
      ? body.screenFrames
          .filter(
            (entry) =>
              entry &&
              typeof entry.id === "string" &&
              typeof entry.ts === "number" &&
              typeof entry.dataUrl === "string" &&
              entry.dataUrl.startsWith("data:image/")
          )
          .slice(0, 6)
      : [];
    const significantEvents = Array.isArray(body.significantEvents)
      ? body.significantEvents
          .filter(
            (entry) =>
              entry &&
              typeof entry.id === "string" &&
              typeof entry.ts === "number" &&
              typeof entry.kind === "string" &&
              typeof entry.title === "string" &&
              typeof entry.detail === "string" &&
              typeof entry.severity === "number"
          )
          .slice(0, 6)
      : [];

    const report = await callOpenAIJson<Omit<DiagnosticReport, "createdAt">>({
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are Laminar.AI's study diagnostician. You convert noisy, vision-based study telemetry into one honest, human-readable diagnostic. Weigh metrics differently by study mode. Reading/notes sessions can tolerate lower blink rate and more downward pitch. Video lecture sessions with low blink rate plus large head drift may indicate passive staring or zoning out. Active recall and problem solving can show brow furrowing and some jaw tension while still be productive. If screen-share frames and significant events are provided, correlate the visible material with the telemetry and identify which topics, question styles, or content layouts align with attention drops, confusion cues, fatigue, jaw tension, or phone distraction. Be as specific as the evidence allows about what was on screen during each significant event. Prefer exact visible text over generic descriptions. If text is legible, quote the exact words or formulas. If it is only partly legible, quote the partial text and say it is partial. Do not use vague fillers like 'lecture notes continued' unless absolutely no better evidence exists. Return a short primary behavior label, a realistic efficiency score from 0 to 100, a concise cognitive-state summary, 2 to 4 optimization tips, a screen correlation summary that mentions the most concrete visible text you can read, up to 4 topic hotspots, and event_correlations that explicitly map a telemetry event to the visible on-screen material and what it likely meant.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                studyRunId: body.studyRunId ?? null,
                setup: body.setup,
                telemetry_summary: body.summary,
                fallback,
                significantEvents,
                eventFrameMap: significantEvents.map((event) => ({
                  eventId: event.id,
                  eventTitle: event.title,
                  linkedFrameId: event.screenFrameId ?? null,
                })),
                screenFrameCount: screenFrames.length,
                instruction:
                  screenFrames.length > 0 && significantEvents.length > 0
                    ? "Correlate each significant event against the nearest screen frame. In each event_correlation, visible_on_screen should name the exact topic/question/page and visible_text_quote should contain the exact text or formula you can read."
                    : screenFrames.length > 0
                      ? "Correlate the screen frames against the telemetry. Extract exact visible text where possible instead of generic page labels."
                      : "No screen frames were provided, so state that no screen-share correlation was available.",
              }),
            },
            ...screenFrames.flatMap((frame, index) => [
              {
                type: "input_text" as const,
                text: `Screen frame ${index + 1} (${frame.id}) at ${new Date(frame.ts ?? Date.now()).toISOString()}${typeof frame.note === "string" ? ` | ${frame.note}` : ""}`,
              },
              {
                type: "input_image" as const,
                image_url: frame.dataUrl!,
                detail: "high" as const,
              },
            ]),
          ],
        },
      ],
      schema: diagnosticSchema,
      operation: "session-diagnostic",
    });

    return NextResponse.json({
      report: {
        createdAt: Date.now(),
        ...report,
      } satisfies DiagnosticReport,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Diagnostic generation failed.",
      },
      { status: 500 }
    );
  }
}
