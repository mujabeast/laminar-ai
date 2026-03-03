import { NextResponse } from "next/server";

import { callOpenAIJson } from "@/lib/ai";

export const runtime = "nodejs";

function buildTopicId(label: string) {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `topic-${Date.now()}`;
}

const academicSchema = {
  name: "studyos_academic_overview",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "mergedTopics",
      "weakVsCareless",
      "trajectory",
      "limitedTimeFocus",
      "repeatedStruggleReason",
    ],
    properties: {
      mergedTopics: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "aliases", "itemIds"],
          properties: {
            label: { type: "string" },
            aliases: {
              type: "array",
              items: { type: "string" },
            },
            itemIds: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
      weakVsCareless: { type: "string" },
      trajectory: { type: "string" },
      limitedTimeFocus: {
        type: "array",
        items: { type: "string" },
      },
      repeatedStruggleReason: { type: "string" },
    },
  },
} as const;

type RequestBody = {
  items?: Array<{
    id: string;
    topicHint: string;
    title: string;
    explanation: string;
    understood: boolean;
    createdAt: number;
    source: string;
  }>;
  masterySeries?: Array<{
    label: string;
    value: number;
    detail: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const items = Array.isArray(body.items) ? body.items.slice(0, 120) : [];
    const masterySeries = Array.isArray(body.masterySeries) ? body.masterySeries.slice(-20) : [];

    if (items.length === 0) {
      return NextResponse.json({ error: "At least one academic item is required." }, { status: 400 });
    }

    const overview = await callOpenAIJson<{
      mergedTopics: Array<{
        label: string;
        aliases: string[];
        itemIds: string[];
      }>;
      weakVsCareless: string;
      trajectory: string;
      limitedTimeFocus: string[];
      repeatedStruggleReason: string;
    }>({
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are analyzing a student's academic weakness log inside Laminar.AI. First, merge items that refer to the same topic even if the names are formatted differently, abbreviated, or include module codes. Keep the merged topic labels clean and human-readable. Then answer four questions: what looks like genuine conceptual weakness versus likely careless mistakes, whether the student is improving/stagnating/regressing, what to focus on with limited study time, and why the same question types keep recurring. Base your answers only on the provided weakness items and mastery trend. Be concrete and concise.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                items,
                masterySeries,
              }),
            },
          ],
        },
      ],
      schema: academicSchema,
      operation: "academic-overview",
    });

    return NextResponse.json({
      createdAt: Date.now(),
      itemCount: items.length,
      mergedTopics: overview.mergedTopics.map((topic) => ({
        id: buildTopicId(topic.label),
        label: topic.label,
        aliases: topic.aliases,
        itemIds: topic.itemIds,
      })),
      weakVsCareless: overview.weakVsCareless,
      trajectory: overview.trajectory,
      limitedTimeFocus: overview.limitedTimeFocus,
      repeatedStruggleReason: overview.repeatedStruggleReason,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Academic overview generation failed.",
      },
      { status: 500 }
    );
  }
}
