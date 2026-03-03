import { NextResponse } from "next/server";

import { callOpenAIJson } from "@/lib/ai";

export const runtime = "nodejs";

const understandingSchema = {
  name: "studyos_understanding_coach",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply", "weaknesses"],
    properties: {
      reply: { type: "string" },
      weaknesses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "explanation"],
          properties: {
            title: { type: "string" },
            explanation: { type: "string" },
          },
        },
      },
    },
  },
} as const;

type RequestBody = {
  session?: {
    studentName?: string;
    topic?: string;
    confusionText?: string;
    skillContext?: string;
    uploads?: Array<{
      name: string;
      type: string;
      storedAs: "text-excerpt" | "metadata-only";
      textExcerpt?: string;
    }>;
    messages?: Array<{
      role: "user" | "assistant";
      text: string;
    }>;
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const session = body.session;

    if (!session?.topic?.trim()) {
      return NextResponse.json({ error: "topic is required." }, { status: 400 });
    }

    const messages = Array.isArray(session.messages) ? session.messages.slice(-10) : [];
    if (messages.length === 0) {
      return NextResponse.json({ error: "At least one message is required." }, { status: 400 });
    }

    const uploads = Array.isArray(session.uploads) ? session.uploads.slice(0, 4) : [];

    const result = await callOpenAIJson<{
      reply: string;
      weaknesses: Array<{ title: string; explanation: string }>;
    }>({
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are a patient study coach inside Laminar.AI. Answer like a strong tutor, but keep the response practical and easy to follow. Use the student's topic, stated confusion, self-assessment, and any extracted text from uploaded papers or quizzes. Also extract the concrete weak areas that should be tracked later in an academic dashboard. Weakness titles should be short and skill-focused.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                studentName: session.studentName,
                topic: session.topic,
                confusionText: session.confusionText,
                skillContext: session.skillContext,
                uploads: uploads.map((upload) => ({
                  name: upload.name,
                  type: upload.type,
                  storedAs: upload.storedAs,
                  textExcerpt: upload.textExcerpt,
                })),
                conversation: messages,
              }),
            },
          ],
        },
      ],
      schema: understandingSchema,
      operation: "understanding-coach",
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Understanding coach failed.",
      },
      { status: 500 }
    );
  }
}
