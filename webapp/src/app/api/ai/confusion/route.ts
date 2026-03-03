import { NextResponse } from "next/server";

import { callOpenAIJson } from "@/lib/ai";

export const runtime = "nodejs";

type ConfusionCaptureInput = {
  id: string;
  ts: number;
  url?: string;
  domain?: string;
  title?: string;
  screenshotDataUrl: string;
};

type ConfusionAnalysisRecord = {
  studyRunId: string;
  createdAt: number;
  summary: string;
  captures: Array<{
    captureId: string;
    title: string;
    visibleContent: string;
    explanation: string;
    likelyTask: string;
    confusionType: string;
    nextStep: string;
    confidence: "low" | "medium" | "high";
  }>;
};

const confusionSchema = {
  name: "studyos_confusion_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "captures"],
    properties: {
      summary: { type: "string" },
      captures: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "captureId",
            "title",
            "visibleContent",
            "explanation",
            "likelyTask",
            "confusionType",
            "nextStep",
            "confidence",
          ],
          properties: {
            captureId: { type: "string" },
            title: { type: "string" },
            visibleContent: { type: "string" },
            explanation: { type: "string" },
            likelyTask: { type: "string" },
            confusionType: { type: "string" },
            nextStep: { type: "string" },
            confidence: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
          },
        },
      },
    },
  },
} as const;

type RequestBody = {
  studyRunId?: string;
  setup?: {
    moduleName?: string;
    topic?: string;
    focusDomain?: string;
  } | null;
  captures?: ConfusionCaptureInput[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const captures = Array.isArray(body.captures) ? body.captures.slice(0, 6) : [];

    if (!body.studyRunId) {
      return NextResponse.json({ error: "studyRunId is required." }, { status: 400 });
    }

    if (captures.length === 0) {
      return NextResponse.json({ error: "At least one confusion capture is required." }, { status: 400 });
    }

    const input = [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You analyze student confusion screenshots from study sessions. For each screenshot, identify what is visibly on the screen, infer the topic or section being studied, then teach it back in simpler terms for a student who feels stuck. The explanation must be short, concrete, and easier to understand than the source material. If the image is ambiguous, say so instead of over-claiming.",
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
              setup: body.setup
                ? {
                    moduleName: body.setup.moduleName,
                    topic: body.setup.topic,
                    focusDomain: body.setup.focusDomain,
                  }
                : null,
              captures: captures.map((capture) => ({
                captureId: capture.id,
                title: capture.title || capture.domain || "Captured screen",
                url: capture.url,
                domain: capture.domain,
                timestamp: new Date(capture.ts).toISOString(),
              })),
            }),
          },
          {
            type: "input_text",
            text:
              "Return each capture with: title, visibleContent (what can actually be seen on screen), likelyTask (topic/section), explanation (a short simpler explanation that teaches the screenshot), confusionType, nextStep, and confidence.",
          },
          ...captures.flatMap((capture) => [
            {
              type: "input_text",
              text: `Screenshot for captureId=${capture.id}`,
            },
            {
              type: "input_image",
              image_url: capture.screenshotDataUrl,
            },
          ]),
        ],
      },
    ];

    const result = await callOpenAIJson<Omit<ConfusionAnalysisRecord, "studyRunId" | "createdAt">>({
      input,
      schema: confusionSchema,
      operation: "confusion-analysis",
    });

    const analysis: ConfusionAnalysisRecord = {
      studyRunId: body.studyRunId,
      createdAt: Date.now(),
      summary: result.summary,
      captures: result.captures,
    };

    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Confusion analysis failed.",
      },
      { status: 500 }
    );
  }
}
