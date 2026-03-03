import { NextResponse } from "next/server";

import { buildProfileContext, callOpenAIJson } from "@/lib/ai";

export const runtime = "nodejs";

type ProfileAnalysisRecord = {
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

const profileSchema = {
  name: "studyos_student_profile",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "profileLabel",
      "summary",
      "attentionPattern",
      "behaviorPattern",
      "strengths",
      "risks",
      "nextExperiment",
    ],
    properties: {
      profileLabel: { type: "string" },
      summary: { type: "string" },
      attentionPattern: { type: "string" },
      behaviorPattern: { type: "string" },
      strengths: {
        type: "array",
        items: { type: "string" },
      },
      risks: {
        type: "array",
        items: { type: "string" },
      },
      nextExperiment: { type: "string" },
    },
  },
} as const;

type RequestBody = {
  studyRunId?: string;
  setup?: {
    studentName?: string;
    moduleName?: string;
    topic?: string;
    focusDomain?: string;
    targetMinutes?: number;
    maxTabSwitches?: number;
    maxLookAwaySpikes?: number;
    guardStyle?: string;
  } | null;
  webcam?: {
    totalSeconds?: number;
    samples?: Array<{ ts: number; facePresent: boolean }>;
  } | null;
  extensionSession?: {
    tabEvents?: Array<{ type?: string }>;
    tabSpans?: Array<{ startTs: number; endTs: number; durationMs: number; domain?: string }>;
    videoEvents?: Array<{ ts: number; type?: string }>;
  } | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    if (!body.studyRunId) {
      return NextResponse.json({ error: "studyRunId is required." }, { status: 400 });
    }

    if (!body.webcam && !body.extensionSession) {
      return NextResponse.json(
        { error: "At least one session source is required." },
        { status: 400 }
      );
    }

    const context = buildProfileContext({
      setup: body.setup ?? null,
      webcam: body.webcam ?? null,
      extensionSession: body.extensionSession ?? null,
    });

    const profile = await callOpenAIJson<
      Omit<ProfileAnalysisRecord, "studyRunId" | "createdAt">
    >({
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You generate concise student behavior profiles from study telemetry. Blend webcam attention and browser behavior. Focus on patterns, not diagnosis. Explain strengths, risks, and one next experiment for the next session.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                studyRunId: body.studyRunId,
                context,
              }),
            },
          ],
        },
      ],
      schema: profileSchema,
      operation: "student-profile",
    });

    const result: ProfileAnalysisRecord = {
      studyRunId: body.studyRunId,
      createdAt: Date.now(),
      ...profile,
    };

    return NextResponse.json({ profile: result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Profile generation failed.",
      },
      { status: 500 }
    );
  }
}
