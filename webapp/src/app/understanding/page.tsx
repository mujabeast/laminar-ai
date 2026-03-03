"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ProfileRequired } from "@/components/profile-required";
import {
  STORAGE_KEYS,
  createUnderstandingSessionRecord,
  isUnderstandingSessionLike,
  mergeUnderstandingWeaknesses,
  setStoredJson,
  type UnderstandingChatMessage,
  type UnderstandingMaterial,
  type UnderstandingSessionRecord,
  useCurrentProfile,
  useStoredJson,
} from "@/lib/studyos";

const TEXT_FILE_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".tsv", ".json"];
const MAX_TEXT_EXCERPT = 6000;

function looksLikeTextFile(file: File) {
  if (file.type.startsWith("text/")) return true;
  const lowercaseName = file.name.toLowerCase();
  return TEXT_FILE_EXTENSIONS.some((extension) => lowercaseName.endsWith(extension));
}

async function fileToMaterial(file: File): Promise<UnderstandingMaterial> {
  if (looksLikeTextFile(file)) {
    const text = (await file.text()).slice(0, MAX_TEXT_EXCERPT);
    return {
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type || "text/plain",
      size: file.size,
      textExcerpt: text,
      storedAs: "text-excerpt",
    };
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    storedAs: "metadata-only",
  };
}

function buildIntakeMessage(args: {
  studentName: string;
  topic: string;
  confusionText: string;
  skillContext: string;
  uploads: UnderstandingMaterial[];
}) {
  const uploadsSummary = args.uploads.length
    ? `Uploaded materials: ${args.uploads.map((upload) => upload.name).join(", ")}.`
    : "No supporting materials uploaded.";

  return [
    `My name is ${args.studentName}.`,
    `I am studying ${args.topic}.`,
    `What I do not understand: ${args.confusionText}.`,
    `My current skill context: ${args.skillContext || "Not provided."}`,
    uploadsSummary,
    "Teach this in a simpler way and point out the weak areas I should track.",
  ].join(" ");
}

export default function UnderstandingCoachPage() {
  const currentProfile = useCurrentProfile();
  const storedSessions = useStoredJson<UnderstandingSessionRecord[]>(
    STORAGE_KEYS.understandingSessions,
    [],
    (value): value is UnderstandingSessionRecord[] =>
      Array.isArray(value) && value.every((entry) => isUnderstandingSessionLike(entry))
  );

  const [studentName, setStudentName] = useState(currentProfile?.name ?? "");
  const [topic, setTopic] = useState("");
  const [confusionText, setConfusionText] = useState("");
  const [skillContext, setSkillContext] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [status, setStatus] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (currentProfile && !studentName.trim()) {
      setStudentName(currentProfile.name);
    }
  }, [currentProfile, studentName]);

  useEffect(() => {
    if (!selectedSessionId && storedSessions[0]) {
      setSelectedSessionId(storedSessions[0].id);
    }
  }, [selectedSessionId, storedSessions]);

  const selectedSession = useMemo(
    () => storedSessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, storedSessions]
  );

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before opening the understanding coach."
        description="Weak topics and mastery checkboxes are now stored per person."
      />
    );
  }

  function persistSessions(nextSessions: UnderstandingSessionRecord[]) {
    const normalized = nextSessions
      .slice()
      .sort((left, right) => right.updatedAt - left.updatedAt);
    setStoredJson(STORAGE_KEYS.understandingSessions, normalized);
  }

  async function requestCoach(session: UnderstandingSessionRecord): Promise<{
    reply: string;
    weaknesses: Array<{ title: string; explanation: string }>;
  }> {
    const response = await fetch("/api/ai/understanding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          studentName: session.studentName,
          topic: session.topic,
          confusionText: session.confusionText,
          skillContext: session.skillContext,
          uploads: session.uploads,
          messages: session.chat.map((message) => ({
            role: message.role,
            text: message.text,
          })),
        },
      }),
    });
    const payload = (await response.json()) as
      | {
          reply?: string;
          weaknesses?: Array<{ title: string; explanation: string }>;
          error?: string;
        }
      | undefined;

    if (!response.ok || !payload?.reply) {
      throw new Error(payload?.error || "Coach request failed.");
    }

    return {
      reply: payload.reply,
      weaknesses: payload.weaknesses ?? [],
    };
  }

  async function startSession() {
    if (!studentName.trim() || !topic.trim() || !confusionText.trim()) {
      setStatus("Name, topic, and what you do not understand are required.");
      return;
    }

    setIsStarting(true);
    setStatus("Starting coach...");

    try {
      const uploads = await Promise.all(pendingFiles.map((file) => fileToMaterial(file)));
      const userMessage: UnderstandingChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: buildIntakeMessage({
          studentName,
          topic,
          confusionText,
          skillContext,
          uploads,
        }),
        createdAt: Date.now(),
      };

      const session = createUnderstandingSessionRecord({
        studentName,
        topic,
        confusionText,
        skillContext,
        uploads,
      });
      session.chat = [userMessage];

      const payload = await requestCoach(session);
      const assistantMessage: UnderstandingChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: payload.reply,
        createdAt: Date.now(),
      };

      const nextSession: UnderstandingSessionRecord = {
        ...session,
        updatedAt: Date.now(),
        chat: [...session.chat, assistantMessage],
        weaknesses: mergeUnderstandingWeaknesses([], payload.weaknesses ?? []),
      };

      persistSessions([nextSession, ...storedSessions.filter((entry) => entry.id !== nextSession.id)]);
      setSelectedSessionId(nextSession.id);
      setTopic("");
      setConfusionText("");
      setSkillContext("");
      setPendingFiles([]);
      setStatus("Coach ready. Weak areas were added to the academic dashboard data.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Coach request failed.");
    } finally {
      setIsStarting(false);
    }
  }

  async function sendMessage() {
    if (!selectedSession || !messageInput.trim()) return;

    setIsSending(true);
    setStatus("Sending message...");

    try {
      const nextUserMessage: UnderstandingChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: messageInput.trim(),
        createdAt: Date.now(),
      };
      const draftSession: UnderstandingSessionRecord = {
        ...selectedSession,
        updatedAt: Date.now(),
        chat: [...selectedSession.chat, nextUserMessage],
      };
      const payload = await requestCoach(draftSession);
      const assistantMessage: UnderstandingChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: payload.reply,
        createdAt: Date.now(),
      };
      const finalizedSession: UnderstandingSessionRecord = {
        ...draftSession,
        updatedAt: Date.now(),
        chat: [...draftSession.chat, assistantMessage],
        weaknesses: mergeUnderstandingWeaknesses(
          draftSession.weaknesses,
          payload.weaknesses ?? []
        ),
      };

      persistSessions(
        storedSessions.map((entry) =>
          entry.id === finalizedSession.id ? finalizedSession : entry
        )
      );
      setMessageInput("");
      setStatus("Weak areas updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Message failed.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="panel flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="eyebrow">Understanding Flow</p>
            <h1 className="section-title">Study coach for topics you do not understand</h1>
            <p className="section-copy">
              Start with your topic, what feels unclear, and any quiz or paper context. Laminar.AI
              will coach you through it and push only the weak areas into the academic dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button-secondary" href="/">
              Home
            </Link>
            <Link className="button-secondary" href="/academic">
              Academic Dashboard
            </Link>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="space-y-6">
            <div className="panel space-y-4">
              <div>
                <p className="eyebrow">New topic</p>
                <h2 className="text-xl font-semibold text-slate-950">Tell Laminar.AI where you are stuck</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Your name">
                  <input
                    className="input-field"
                    onChange={(event) => setStudentName(event.target.value)}
                    value={studentName}
                  />
                </Field>
                <Field label="Topic you are studying">
                  <input
                    className="input-field"
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="Laplace transforms"
                    value={topic}
                  />
                </Field>
              </div>

              <Field label="What do you not understand about the topic?">
                <textarea
                  className="input-field min-h-32"
                  onChange={(event) => setConfusionText(event.target.value)}
                  placeholder="I do not know when to use partial fractions versus completing the square..."
                  value={confusionText}
                />
              </Field>

              <Field label="Past papers, quiz results, or skill notes">
                <textarea
                  className="input-field min-h-28"
                  onChange={(event) => setSkillContext(event.target.value)}
                  placeholder="I usually lose marks on inverse transforms and short derivation questions..."
                  value={skillContext}
                />
              </Field>

              <Field label="Upload quiz or paper files">
                <input
                  className="input-field py-3"
                  multiple
                  onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
                  type="file"
                />
              </Field>

              {pendingFiles.length > 0 ? (
                <div className="rounded-2xl bg-slate-950/5 px-4 py-3 text-sm text-slate-700">
                  {pendingFiles.length} file(s) selected. Text-based files are excerpted for coach
                  context; unsupported binaries are stored as references only.
                </div>
              ) : null}

              <button className="button-primary" disabled={isStarting} onClick={startSession} type="button">
                {isStarting ? "Starting..." : "Start coach"}
              </button>
            </div>

            <div className="panel space-y-4">
              <div>
                <p className="eyebrow">Recent topics</p>
                <h2 className="text-xl font-semibold text-slate-950">Saved understanding sessions</h2>
              </div>
              {storedSessions.length === 0 ? (
                <p className="text-sm text-slate-600">No understanding sessions saved yet.</p>
              ) : (
                <div className="space-y-2">
                  {storedSessions.map((session) => (
                    <button
                      key={session.id}
                      className={`w-full rounded-[1.5rem] border px-4 py-4 text-left ${
                        selectedSessionId === session.id
                          ? "border-[#0f3d3e] bg-[#0f3d3e]/10"
                          : "border-slate-200 bg-white/80"
                      }`}
                      onClick={() => setSelectedSessionId(session.id)}
                      type="button"
                    >
                      <div className="font-semibold text-slate-900">{session.topic}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {session.weaknesses.length} tracked weak area(s)
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="panel space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Coach chat</p>
                  <h2 className="text-xl font-semibold text-slate-950">
                    {selectedSession ? selectedSession.topic : "Pick a topic"}
                  </h2>
                </div>
                {selectedSession ? (
                  <div className="rounded-full bg-slate-950/5 px-4 py-2 text-sm text-slate-700">
                    {selectedSession.weaknesses.length} weakness item(s) synced to academics
                  </div>
                ) : null}
              </div>

              {status ? <div className="text-sm text-slate-600">{status}</div> : null}

              {!selectedSession ? (
                <p className="text-sm text-slate-600">
                  Start a topic on the left to open the coach and populate the academic dashboard.
                </p>
              ) : (
                <>
                  <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                    {selectedSession.chat.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-[1.5rem] px-4 py-4 text-sm leading-7 ${
                          message.role === "assistant"
                            ? "bg-slate-950/5 text-slate-800"
                            : "bg-[#0f3d3e] text-white"
                        }`}
                      >
                        {message.text}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <textarea
                      className="input-field min-h-28"
                      onChange={(event) => setMessageInput(event.target.value)}
                      placeholder="Ask a follow-up question..."
                      value={messageInput}
                    />
                    <button
                      className="button-primary"
                      disabled={isSending || !messageInput.trim()}
                      onClick={sendMessage}
                      type="button"
                    >
                      {isSending ? "Sending..." : "Send"}
                    </button>
                  </div>
                </>
              )}
            </div>

            {selectedSession ? (
              <div className="panel space-y-4">
                <div>
                  <p className="eyebrow">Weak areas</p>
                  <h2 className="text-xl font-semibold text-slate-950">Items sent to the academic dashboard</h2>
                </div>
                {selectedSession.weaknesses.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    The coach has not extracted any weak areas yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedSession.weaknesses.map((weakness) => (
                      <div
                        key={weakness.id}
                        className="rounded-[1.5rem] border border-slate-200 bg-white/85 px-4 py-4"
                      >
                        <div className="font-semibold text-slate-900">{weakness.title}</div>
                        <div className="mt-2 text-sm text-slate-600">{weakness.explanation}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <div className="text-sm font-medium text-slate-700">{label}</div>
      {children}
    </label>
  );
}
