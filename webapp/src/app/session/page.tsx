"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FaceDetector, FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

import { ProfileRequired } from "@/components/profile-required";
import {
  STORAGE_KEYS,
  type Sample,
  type StudySetup,
  type StudyRunRecord,
  type WebcamSession,
  countLookAwaySpikes,
  getStoredJson,
  getStoredStudyRun,
  isStudyRunRecordLike,
  isStudySetupLike,
  normalizeGuardStyle,
  startFreshStudyRun,
  setStoredJson,
  syncStudyRunToExtension,
  upsertCurrentStudyRun,
  useCurrentProfile,
  useStoredJson,
} from "@/lib/studyos";

const SAMPLE_INTERVAL_MS = 600;
const TIMER_REFRESH_MS = 250;
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";
const MEDIAPIPE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const MEDIAPIPE_OBJECT_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite";
const BENIGN_MEDIAPIPE_LOGS = ["Created TensorFlow Lite XNNPACK delegate for CPU"];

function getWallClockTime() {
  return Date.now();
}

function getVideoClockTime() {
  return performance.now();
}

function isBenignMediapipeLog(value: unknown) {
  if (typeof value !== "string") return false;
  return BENIGN_MEDIAPIPE_LOGS.some((message) => value.includes(message));
}

function withSuppressedMediapipeLogs<T>(work: () => T) {
  const originalConsoleError = console.error;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;

  console.error = (...args: unknown[]) => {
    if (args.some(isBenignMediapipeLog)) return;
    originalConsoleError(...args);
  };
  console.info = (...args: unknown[]) => {
    if (args.some(isBenignMediapipeLog)) return;
    originalConsoleInfo(...args);
  };
  console.warn = (...args: unknown[]) => {
    if (args.some(isBenignMediapipeLog)) return;
    originalConsoleWarn(...args);
  };

  try {
    return work();
  } finally {
    console.error = originalConsoleError;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
  }
}

function isPhoneCategory(label: string | undefined) {
  if (!label) return false;
  const normalized = label.trim().toLowerCase();
  return normalized === "cell phone" || normalized === "mobile phone" || normalized === "phone";
}

export default function SessionPage() {
  const router = useRouter();
  const currentProfile = useCurrentProfile();
  const currentSetup = useStoredJson<StudySetup | null>(
    STORAGE_KEYS.studySetupCurrent,
    null,
    (value): value is StudySetup | null => value === null || isStudySetupLike(value)
  );
  const currentRun = useStoredJson<StudyRunRecord | null>(
    STORAGE_KEYS.studyRunCurrent,
    null,
    (value): value is StudyRunRecord | null => value === null || isStudyRunRecordLike(value)
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const objectDetectorRef = useRef<ObjectDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectTimeoutRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const sessionRunningRef = useRef(false);
  const elapsedMsRef = useRef(0);
  const runStartedAtRef = useRef<number | null>(null);
  const samplesRef = useRef<Sample[]>([]);
  const alarmContextRef = useRef<AudioContext | null>(null);
  const alarmGainRef = useRef<GainNode | null>(null);
  const alarmOscillatorsRef = useRef<OscillatorNode[]>([]);
  const alarmActiveRef = useRef(false);

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [faceNow, setFaceNow] = useState(false);
  const [phoneNow, setPhoneNow] = useState(false);
  const [lookAwaySpikes, setLookAwaySpikes] = useState(0);
  const [alarmWarning, setAlarmWarning] = useState("");
  const [status, setStatus] = useState("Idle");

  useEffect(() => {
    sessionRunningRef.current = sessionRunning;
  }, [sessionRunning]);

  useEffect(() => {
    if (currentRun) {
      syncStudyRunToExtension(currentRun);
    }
  }, [currentRun]);

  function isLockInMode() {
    return normalizeGuardStyle(currentSetup?.guardStyle) === "lock-in";
  }

  async function primeAlarmAudio() {
    if (typeof window === "undefined") return null;

    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) return null;

    if (!alarmContextRef.current) {
      alarmContextRef.current = new AudioContextCtor();
    }

    if (alarmContextRef.current.state === "suspended") {
      await alarmContextRef.current.resume();
    }

    return alarmContextRef.current;
  }

  async function startAlarm(reason: string) {
    if (alarmActiveRef.current) {
      setAlarmWarning(reason);
      return;
    }

    const context = await primeAlarmAudio();
    if (!context) return;

    const gain = context.createGain();
    gain.gain.value = 0.18;
    gain.connect(context.destination);

    const low = context.createOscillator();
    low.type = "square";
    low.frequency.value = 660;
    low.connect(gain);

    const high = context.createOscillator();
    high.type = "sawtooth";
    high.frequency.value = 990;
    high.connect(gain);

    low.start();
    high.start();

    alarmGainRef.current = gain;
    alarmOscillatorsRef.current = [low, high];
    alarmActiveRef.current = true;
    setAlarmWarning(reason);
  }

  function stopAlarm() {
    for (const oscillator of alarmOscillatorsRef.current) {
      try {
        oscillator.stop();
      } catch {}
      try {
        oscillator.disconnect();
      } catch {}
    }
    alarmOscillatorsRef.current = [];

    if (alarmGainRef.current) {
      try {
        alarmGainRef.current.disconnect();
      } catch {}
      alarmGainRef.current = null;
    }

    alarmActiveRef.current = false;
    setAlarmWarning("");
  }

  function clearDetectLoop() {
    if (detectTimeoutRef.current !== null) {
      window.clearTimeout(detectTimeoutRef.current);
      detectTimeoutRef.current = null;
    }
  }

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function getElapsedMs() {
    if (!sessionRunningRef.current || runStartedAtRef.current === null) {
      return elapsedMsRef.current;
    }

    return elapsedMsRef.current + (getWallClockTime() - runStartedAtRef.current);
  }

  function syncElapsedSeconds() {
    setSeconds(Math.floor(getElapsedMs() / 1000));
  }

  function startTimer() {
    clearTimer();
    syncElapsedSeconds();
    timerRef.current = window.setInterval(syncElapsedSeconds, TIMER_REFRESH_MS);
  }

  function commitElapsedTime() {
    if (runStartedAtRef.current === null) return;

    elapsedMsRef.current += getWallClockTime() - runStartedAtRef.current;
    runStartedAtRef.current = null;
    syncElapsedSeconds();
  }

  function resetSessionState() {
    elapsedMsRef.current = 0;
    runStartedAtRef.current = null;
    samplesRef.current = [];
    setSeconds(0);
    setSampleCount(0);
    setFaceNow(false);
    setPhoneNow(false);
    setLookAwaySpikes(0);
    stopAlarm();
  }

  async function runDetection() {
    if (!sessionRunningRef.current) return;

    const video = videoRef.current;
    const detector = detectorRef.current;
    const objectDetector = objectDetectorRef.current;
    if (!video || !detector) return;

    try {
      const faceResult = withSuppressedMediapipeLogs(() =>
        detector.detectForVideo(video, getVideoClockTime())
      );
      const objectResult = objectDetector
        ? withSuppressedMediapipeLogs(() => objectDetector.detectForVideo(video, getVideoClockTime()))
        : null;
      const faceDetected = (faceResult.detections?.length ?? 0) > 0;
      const phonePresent =
        objectResult?.detections?.some((detection) =>
          (detection.categories ?? []).some((category) => isPhoneCategory(category.categoryName))
        ) ?? false;
      const facePresent = faceDetected && !phonePresent;
      const sample = { ts: getWallClockTime(), facePresent, phonePresent };

      samplesRef.current.push(sample);
      setFaceNow(facePresent);
      setPhoneNow(phonePresent);
      setSampleCount(samplesRef.current.length);
      const nextLookAwaySpikes = countLookAwaySpikes(samplesRef.current, 2000);
      setLookAwaySpikes(nextLookAwaySpikes);

      if (
        isLockInMode() &&
        currentSetup &&
        ((nextLookAwaySpikes > currentSetup.maxLookAwaySpikes && !facePresent) || phonePresent)
      ) {
        await startAlarm(
          phonePresent
            ? "Phone detected in frame. Put the phone down to stop the alarm."
            : "Look-away limit exceeded. Look back at the screen to stop the alarm."
        );
      } else {
        stopAlarm();
      }
    } catch (error) {
      console.error(error);
      setStatus("Face detection failed during the session. Check the console for details.");
      pauseSession();
      return;
    }

    detectTimeoutRef.current = window.setTimeout(runDetection, SAMPLE_INTERVAL_MS);
  }

  async function enableCamera() {
    if (cameraEnabled) return;

    let nextStream: MediaStream | null = null;

    try {
      setStatus("Requesting camera permission...");

      const video = videoRef.current;
      if (!video) return;

      nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      video.srcObject = nextStream;
      await video.play();

      setStatus("Loading face detector model...");
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      const detector = await withSuppressedMediapipeLogs(() =>
        FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MEDIAPIPE_MODEL_URL,
          },
          runningMode: "VIDEO",
        })
      );
      const objectDetector = await withSuppressedMediapipeLogs(() =>
        ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MEDIAPIPE_OBJECT_MODEL_URL,
          },
          scoreThreshold: 0.35,
          runningMode: "VIDEO",
          maxResults: 4,
        })
      );

      streamRef.current = nextStream;
      detectorRef.current = detector;
      objectDetectorRef.current = objectDetector;
      setCameraEnabled(true);
      await primeAlarmAudio();
      setStatus("Camera enabled. Ready to start.");
    } catch (error) {
      console.error(error);
      nextStream?.getTracks().forEach((track) => track.stop());
      setStatus("Camera or model setup failed. Check permissions, HTTPS, or the console.");
      alert("Camera or model setup failed. Open the browser console if you need the exact error.");
    }
  }

  function startOrResumeSession() {
    if (!cameraEnabled) return;
    if (sessionRunningRef.current) return;

    const isNewSession = elapsedMsRef.current === 0 && samplesRef.current.length === 0;
    if (isNewSession) {
      resetSessionState();

      const shouldStartFreshRun =
        !currentRun ||
        currentRun.setupId !== (currentSetup?.id ?? null) ||
        currentRun.webcamSessionId !== null ||
        currentRun.extensionSessionId !== null;

      if (shouldStartFreshRun) {
        startFreshStudyRun(currentSetup);
      } else {
        syncStudyRunToExtension(currentRun);
      }
    }

    runStartedAtRef.current = getWallClockTime();
    sessionRunningRef.current = true;
    setSessionRunning(true);
    setStatus(isNewSession ? "Session running..." : "Session resumed...");
    void primeAlarmAudio();
    startTimer();
    clearDetectLoop();
    void runDetection();
  }

  function pauseSession() {
    if (!sessionRunningRef.current) return;

    sessionRunningRef.current = false;
    setSessionRunning(false);
    commitElapsedTime();
    clearDetectLoop();
    clearTimer();
    stopAlarm();
    setStatus("Session paused.");
  }

  function endAndAnalyze() {
    if (!cameraEnabled || sampleCount === 0) return;

    pauseSession();

    const activeRun = getStoredStudyRun() ?? startFreshStudyRun(currentSetup);

    const payload: WebcamSession = {
      sessionId: crypto.randomUUID(),
      studyRunId: activeRun.studyRunId,
      createdAt: getWallClockTime(),
      totalSeconds: Math.floor(getElapsedMs() / 1000),
      samples: [...samplesRef.current],
      setupSnapshot: currentSetup,
    };

    setStoredJson(STORAGE_KEYS.attentionLast, payload);

    const history = getStoredJson<WebcamSession[]>(STORAGE_KEYS.attentionHistory, []);
    history.unshift(payload);
    setStoredJson(STORAGE_KEYS.attentionHistory, history.slice(0, 20));
    upsertCurrentStudyRun({
      studyRunId: activeRun.studyRunId,
      setup: currentSetup,
      webcamSessionId: payload.sessionId,
      webcamCompletedAt: payload.createdAt,
    });

    router.push("/import");
  }

  useEffect(() => {
    const currentVideo = videoRef.current;

    return () => {
      clearDetectLoop();
      clearTimer();
      stopAlarm();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      detectorRef.current?.close();
      objectDetectorRef.current?.close();
      if (alarmContextRef.current) {
        void alarmContextRef.current.close();
        alarmContextRef.current = null;
      }

      if (currentVideo) {
        currentVideo.srcObject = null;
      }
    };
  }, []);

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainingSeconds = String(seconds % 60).padStart(2, "0");

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before starting a webcam session."
        description="Webcam samples and study runs are now stored per person."
      />
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="panel flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="section-title">Webcam Attention Session</h1>
            <p className="section-copy">
              Run a local webcam session to estimate attention drift without uploading video.
            </p>
            {currentSetup ? (
              <div className="rounded-2xl bg-slate-950/5 px-4 py-3 text-sm text-slate-700">
                {currentSetup.studentName} is studying {currentSetup.moduleName} ({currentSetup.topic})
                with a {currentSetup.targetMinutes}-minute target, {currentSetup.maxTabSwitches} tab
                exits, and {currentSetup.maxLookAwaySpikes} look-away spikes allowed.
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No study plan saved yet. You can still record a session, but streaks and goal
                evaluation work best after setting up a plan on the landing page.
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button-secondary" href="/dashboard">
              Dashboard
            </Link>
            <Link className="button-secondary" href="/history">
              History
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="panel space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Timer" value={`${minutes}:${remainingSeconds}`} />
              <StatCard label="Samples" value={String(sampleCount)} />
            </div>

            <div className="grid gap-3 text-sm text-slate-700">
              <StatusRow
                label="Guard mode"
                value={normalizeGuardStyle(currentSetup?.guardStyle) === "lock-in" ? "Lock in mode" : "Noob mode"}
              />
              <StatusRow label="Camera" value={cameraEnabled ? "Enabled" : "Off"} />
              <StatusRow label="Face detected now" value={faceNow ? "Yes" : "No"} />
              <StatusRow label="Phone detected now" value={phoneNow ? "Yes" : "No"} />
              <StatusRow label="Look-away spikes" value={String(lookAwaySpikes)} />
              <StatusRow label="Session" value={sessionRunning ? "Running" : "Stopped"} />
            </div>

            <div className="rounded-2xl bg-slate-950/5 px-4 py-3 text-sm text-slate-600">
              {status}
            </div>

            {alarmWarning ? (
              <div className="rounded-2xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-900">
                {alarmWarning}
              </div>
            ) : null}

            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-600">
              Privacy note: Laminar.AI stores only timestamped face-present and optional phone-detected
              flags on this device. Video frames are never uploaded or saved.
            </div>

            <div className="rounded-2xl bg-[#0f3d3e]/8 px-4 py-3 text-sm text-slate-700">
              {normalizeGuardStyle(currentSetup?.guardStyle) === "lock-in"
                ? "Lock in mode is armed: after you exceed the configured look-away limit, looking away again or having a phone in frame will trigger a continuous alarm until you refocus."
                : "Next step after ending: the dashboard will open automatically. If the extension JSON is still missing, the dashboard will prompt you to upload it there on the same page."}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="button-secondary"
                disabled={cameraEnabled}
                onClick={enableCamera}
                type="button"
              >
                {cameraEnabled ? "Camera Ready" : "Enable Camera"}
              </button>

              <button
                className="button-primary"
                disabled={!cameraEnabled || sessionRunning}
                onClick={startOrResumeSession}
                type="button"
              >
                {sampleCount > 0 ? "Resume Session" : "Start Session"}
              </button>

              <button
                className="button-secondary"
                disabled={!sessionRunning}
                onClick={pauseSession}
                type="button"
              >
                Pause
              </button>

              <button
                className="rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!cameraEnabled || sampleCount === 0}
                onClick={endAndAnalyze}
                type="button"
              >
                End and Analyze
              </button>
            </div>
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="eyebrow">Preview</p>
              <h2 className="text-xl font-semibold text-slate-950">Live camera feed</h2>
            </div>
            <video
              ref={videoRef}
              className="aspect-video w-full rounded-[1.5rem] border border-slate-200 bg-slate-950 object-cover"
              playsInline
              muted
            />
            <div className="rounded-2xl bg-[#0f3d3e]/8 px-4 py-3 text-sm text-slate-700">
              Demo tip: look away or step out of frame for 2 to 3 seconds to create a clear
              look-away spike. If you hold a phone up to the webcam, Laminar.AI will flag it too.
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 shadow-sm">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <div className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{value}</div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}
