import { NextResponse } from "next/server";

import { buildTrendContext, callOpenAIJson } from "@/lib/ai";

export const runtime = "nodejs";

type AttentionReportRecord = {
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

type TrendAnalysisRecord = {
  createdAt: number;
  windowSize: number;
  trendLabel: "improving" | "stuck" | "burnout" | "unstable";
  summary: string;
  strongestPredictors: string[];
  nextWeekExperiment: string;
};

const trendSchema = {
  name: "studyos_trend_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["trendLabel", "summary", "strongestPredictors", "nextWeekExperiment"],
    properties: {
      trendLabel: {
        type: "string",
        enum: ["improving", "stuck", "burnout", "unstable"],
      },
      summary: { type: "string" },
      strongestPredictors: {
        type: "array",
        items: { type: "string" },
      },
      nextWeekExperiment: { type: "string" },
    },
  },
} as const;

type RequestBody = {
  reports?: AttentionReportRecord[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const reports = Array.isArray(body.reports) ? body.reports.slice(0, 12) : [];

    if (reports.length < 3) {
      return NextResponse.json(
        { error: "At least three reports are required." },
        { status: 400 }
      );
    }

    const trends = await callOpenAIJson<
      Omit<TrendAnalysisRecord, "createdAt" | "windowSize">
    >({
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You analyze study telemetry across multiple sessions. Choose exactly one trend label from improving, stuck, burnout, or unstable. Base the label on trajectory, consistency, and likely predictors. Then suggest one next-week experiment that is specific and testable.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                reports: buildTrendContext(reports),
              }),
            },
          ],
        },
      ],
      schema: trendSchema,
      operation: "trend-analysis",
    });

    const result: TrendAnalysisRecord = {
      createdAt: Date.now(),
      windowSize: reports.length,
      ...trends,
    };

    return NextResponse.json({ trends: result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Trend analysis failed.",
      },
      { status: 500 }
    );
  }
}
