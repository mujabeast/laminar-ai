import { NextResponse } from "next/server";

import { callOpenAIJson } from "@/lib/ai";

export const runtime = "nodejs";

type RequestBody = {
  scope?: "attention" | "academic";
  controlsLabel?: string;
  pageContext?: string;
  datasets?: Array<{
    id: string;
    label: string;
    defaultChartType: "line" | "bar" | "donut";
    supportedChartTypes: Array<"line" | "bar" | "donut">;
    points: Array<{
      label: string;
      value: number;
    }>;
    note?: string;
  }>;
};

const visualsSchema = {
  name: "laminar_ai_visual_board",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "cards"],
    properties: {
      summary: { type: "string" },
      cards: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["datasetId", "title", "subtitle", "chartType", "insight", "highlight"],
          properties: {
            datasetId: { type: "string" },
            title: { type: "string" },
            subtitle: { type: "string" },
            chartType: {
              type: "string",
              enum: ["line", "bar", "donut"],
            },
            insight: { type: "string" },
            highlight: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const datasets = Array.isArray(body.datasets)
      ? body.datasets
          .filter(
            (dataset) =>
              dataset &&
              typeof dataset.id === "string" &&
              Array.isArray(dataset.points) &&
              dataset.points.length > 0
          )
          .slice(0, 8)
      : [];

    if (!body.scope || (body.scope !== "attention" && body.scope !== "academic")) {
      return NextResponse.json({ error: "scope must be attention or academic." }, { status: 400 });
    }

    if (datasets.length < 2) {
      return NextResponse.json(
        { error: "At least two candidate datasets are required." },
        { status: 400 }
      );
    }

    const allowedByDataset = new Map(
      datasets.map((dataset) => [dataset.id, new Set(dataset.supportedChartTypes)])
    );

    const payload = await callOpenAIJson<{
      summary: string;
      cards: Array<{
        datasetId: string;
        title: string;
        subtitle: string;
        chartType: "line" | "bar" | "donut";
        insight: string;
        highlight: string;
      }>;
    }>({
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are the visualization director for Laminar.AI. Build a small, elegant chart board for one student. Use only the provided dataset ids. Do not invent data. Pick the datasets that best explain the student's current pattern, choose a supported chart type for each one, and write concise titles, subtitles, one-sentence insights, and a short highlight badge. Keep everything practical and analytical, not marketing-heavy.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                scope: body.scope,
                controlsLabel: body.controlsLabel ?? "",
                pageContext: body.pageContext ?? "",
                datasets,
              }),
            },
          ],
        },
      ],
      schema: visualsSchema,
      operation: `${body.scope}-visual-board`,
    });

    const validatedCards = payload.cards
      .filter((card) => allowedByDataset.has(card.datasetId))
      .map((card) => {
        const supported = allowedByDataset.get(card.datasetId);
        const fallback = datasets.find((dataset) => dataset.id === card.datasetId)?.defaultChartType ?? "line";
        const chartType =
          supported && supported.has(card.chartType) ? card.chartType : fallback;

        return {
          ...card,
          chartType,
        };
      })
      .slice(0, 5);

    if (validatedCards.length === 0) {
      return NextResponse.json({ error: "AI did not return valid chart cards." }, { status: 500 });
    }

    return NextResponse.json({
      createdAt: Date.now(),
      summary: payload.summary,
      cards: validatedCards,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Visual generation failed.",
      },
      { status: 500 }
    );
  }
}
