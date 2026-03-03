"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  FaceLandmarker,
  FilesetResolver,
  ObjectDetector,
  PoseLandmarker,
  type Classifications,
  type Matrix,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import { ProfileRequired } from "@/components/profile-required";
import {
  getGuardStyleLabel,
  STORAGE_KEYS,
  type StudyRunRecord,
  type StudySetup,
  getStoredJson,
  getStoredStudyRun,
  isStudyRunRecordLike,
  isStudySetupLike,
  normalizeGuardStyle,
  normalizeStudyMode,
  setStoredJson,
  startFreshStudyRun,
  upsertCurrentStudyRun,
  useCurrentProfile,
  useStoredJson,
} from "@/lib/studyos";
import {
  type DiagnosticReport,
  type PostureLabel,
  type ScreenFrameSample,
  type TelemetrySample,
  type VisibilityEvent,
  type WebcamSession,
  computeTelemetrySummary,
  deriveSignificantEvents,
  deriveFallbackDiagnostic,
  isWebcamSessionLike,
} from "@/lib/telemetry";

const SAMPLE_INTERVAL_MS = 250;
const TIMER_REFRESH_MS = 250;
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";
const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const OBJECT_DETECTOR_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite";
const BENIGN_MEDIAPIPE_LOGS = ["Created TensorFlow Lite XNNPACK delegate for CPU"];
const SCREEN_CAPTURE_INTERVAL_MS = 2500;
const EVENT_CAPTURE_COOLDOWN_MS = 1200;
const MAX_SCREEN_FRAMES = 10;
function getWallClockTime() {
  return Date.now();
}

function getVideoClockTime() {
  return performance.now();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function countTrailingSamples<T>(items: T[], predicate: (item: T) => boolean) {
  let count = 0;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!predicate(items[index])) break;
    count += 1;
  }

  return count;
}

function getTrailingDurationMs<T extends { ts: number }>(
  items: T[],
  predicate: (item: T) => boolean,
  fallbackIntervalMs = SAMPLE_INTERVAL_MS
) {
  let duration = 0;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!predicate(item)) break;

    if (index === 0) {
      duration += fallbackIntervalMs;
    } else {
      duration += Math.max(1, item.ts - items[index - 1].ts);
    }
  }

  return duration;
}

function getLatestHiddenBreakMs(events: VisibilityEvent[]) {
  const ordered = [...events].sort((left, right) => left.ts - right.ts);

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (ordered[index].state !== "visible") continue;

    for (let backIndex = index - 1; backIndex >= 0; backIndex -= 1) {
      if (ordered[backIndex].state !== "hidden") continue;
      return Math.max(0, ordered[index].ts - ordered[backIndex].ts);
    }
  }

  const lastEvent = ordered[ordered.length - 1];
  if (lastEvent?.state === "hidden") {
    return Math.max(0, getWallClockTime() - lastEvent.ts);
  }

  return 0;
}

function isPhoneCategory(label: string | undefined) {
  if (!label) return false;
  const normalized = label.trim().toLowerCase();
  return normalized === "cell phone" || normalized === "mobile phone" || normalized === "phone";
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

function getBlendshapeScore(
  blendshapes: Classifications | undefined,
  names: string[],
  fallback = 0
) {
  const categories = blendshapes?.categories ?? [];
  const values = names
    .map((name) => categories.find((category) => category.categoryName === name)?.score ?? null)
    .filter((value): value is number => typeof value === "number");

  if (!values.length) return fallback;
  return average(values);
}

function deriveHeadPose(matrix: Matrix | undefined) {
  const values = matrix?.data ?? [];
  if (values.length < 16) {
    return { pitch: 0, yaw: 0, roll: 0 };
  }

  const r00 = values[0] ?? 1;
  const r10 = values[4] ?? 0;
  const r20 = values[8] ?? 0;
  const r21 = values[9] ?? 0;
  const r22 = values[10] ?? 1;

  const yaw = Math.asin(clamp(-r20, -1, 1));
  const pitch = Math.atan2(r21, r22);
  const roll = Math.atan2(r10, r00);

  return {
    pitch: round((pitch * 180) / Math.PI),
    yaw: round((yaw * 180) / Math.PI),
    roll: round((roll * 180) / Math.PI),
  };
}

function landmarkVisible(landmark: NormalizedLandmark | undefined) {
  return !!landmark && (landmark.visibility ?? 1) >= 0.35;
}

function derivePosture(landmarks: NormalizedLandmark[] | undefined) {
  const leftShoulder = landmarks?.[11];
  const rightShoulder = landmarks?.[12];
  const leftHip = landmarks?.[23];
  const rightHip = landmarks?.[24];
  const nose = landmarks?.[0];

  if (
    !landmarkVisible(leftShoulder) ||
    !landmarkVisible(rightShoulder) ||
    !landmarkVisible(leftHip) ||
    !landmarkVisible(rightHip)
  ) {
    return { posture: "unknown" as PostureLabel, shoulderTilt: null };
  }

  const shoulderMidX = ((leftShoulder?.x ?? 0) + (rightShoulder?.x ?? 0)) / 2;
  const shoulderMidY = ((leftShoulder?.y ?? 0) + (rightShoulder?.y ?? 0)) / 2;
  const hipMidY = ((leftHip?.y ?? 0) + (rightHip?.y ?? 0)) / 2;
  const torsoHeight = hipMidY - shoulderMidY;
  const shoulderTilt = Math.abs((leftShoulder?.y ?? 0) - (rightShoulder?.y ?? 0));
  const headOffset = nose ? Math.abs(nose.x - shoulderMidX) : 0;

  const slouching = torsoHeight < 0.16 || shoulderTilt > 0.06 || headOffset > 0.12;

  return {
    posture: slouching ? ("slouching" as const) : ("upright-focused" as const),
    shoulderTilt: round(shoulderTilt, 3),
  };
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
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const objectDetectorRef = useRef<ObjectDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const detectTimeoutRef = useRef<number | null>(null);
  const screenCaptureTimeoutRef = useRef<number | null>(null);
  const lastScreenCaptureTsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const sessionRunningRef = useRef(false);
  const elapsedMsRef = useRef(0);
  const runStartedAtRef = useRef<number | null>(null);
  const samplesRef = useRef<TelemetrySample[]>([]);
  const visibilityEventsRef = useRef<VisibilityEvent[]>([]);
  const screenFramesRef = useRef<ScreenFrameSample[]>([]);
  const blinkClosedRef = useRef(false);
  const lastBlinkTsRef = useRef<number>(0);
  const alarmContextRef = useRef<AudioContext | null>(null);
  const alarmGainRef = useRef<GainNode | null>(null);
  const alarmOscillatorsRef = useRef<OscillatorNode[]>([]);
  const alarmActiveRef = useRef(false);

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(false);
  const [isWrappingUp, setIsWrappingUp] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [faceNow, setFaceNow] = useState(false);
  const [phoneNow, setPhoneNow] = useState(false);
  const [postureNow, setPostureNow] = useState<PostureLabel>("unknown");
  const [attentionNow, setAttentionNow] = useState(false);
  const [blinkRateNow, setBlinkRateNow] = useState(0);
  const [perclosNow, setPerclosNow] = useState(0);
  const [headDriftNow, setHeadDriftNow] = useState("0 / 0 / 0");
  const [browNow, setBrowNow] = useState(0);
  const [jawNow, setJawNow] = useState(0);
  const [lookAwaySpikes, setLookAwaySpikes] = useState(0);
  const [visibilityState, setVisibilityState] = useState<"visible" | "hidden">(
    typeof document === "undefined" || document.visibilityState !== "hidden" ? "visible" : "hidden"
  );
  const [screenFrameCount, setScreenFrameCount] = useState(0);
  const [alarmWarning, setAlarmWarning] = useState("");
  const [status, setStatus] = useState("Idle");

  useEffect(() => {
    sessionRunningRef.current = sessionRunning;
  }, [sessionRunning]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const nextState = document.visibilityState === "hidden" ? "hidden" : "visible";
      setVisibilityState(nextState);

      if (sessionRunningRef.current) {
        visibilityEventsRef.current.push({
          ts: getWallClockTime(),
          state: nextState,
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  function getCurrentGuardStyle() {
    return normalizeGuardStyle(currentSetup?.guardStyle);
  }

  function buildGuardAlertReason() {
    const guardStyle = getCurrentGuardStyle();
    if (guardStyle === "noob") return null;

    const phonePresenceLimit = guardStyle === "lock-in" ? 1 : 3;
    const absenceLimitMs = guardStyle === "lock-in" ? 2000 : 5000;
    const eyesClosedLimitMs = guardStyle === "lock-in" ? 2000 : 5000;

    const phonePresenceCount = countTrailingSamples(samplesRef.current, (entry) => entry.phoneDetected);
    const faceAwayDurationMs = getTrailingDurationMs(
      samplesRef.current,
      (entry) => !entry.facePresent,
      SAMPLE_INTERVAL_MS
    );
    const eyesClosedDurationMs = getTrailingDurationMs(
      samplesRef.current,
      (entry) => entry.eyeClosure >= 0.82,
      SAMPLE_INTERVAL_MS
    );
    const latestHiddenBreakMs = getLatestHiddenBreakMs(visibilityEventsRef.current);

    if (phonePresenceCount >= phonePresenceLimit) {
      return guardStyle === "lock-in"
        ? "Phone detected. Lock in mode does not allow any phone presence. Put it away to stop the alarm."
        : "Phone stayed in frame across three samples. Put it away to keep the session clean.";
    }

    if (latestHiddenBreakMs >= absenceLimitMs) {
      return `The study page lost visibility for more than ${Math.round(absenceLimitMs / 1000)} seconds. Return and re-anchor on the task.`;
    }

    if (faceAwayDurationMs >= absenceLimitMs) {
      return `Your face left the frame for more than ${Math.round(absenceLimitMs / 1000)} seconds. Re-center on the study block.`;
    }

    if (eyesClosedDurationMs >= eyesClosedLimitMs) {
      return `Your eyes stayed fully closed for more than ${Math.round(eyesClosedLimitMs / 1000)} seconds. Wake the posture back up before continuing.`;
    }

    return null;
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

  function clearScreenCaptureLoop() {
    if (screenCaptureTimeoutRef.current !== null) {
      window.clearTimeout(screenCaptureTimeoutRef.current);
      screenCaptureTimeoutRef.current = null;
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
    visibilityEventsRef.current = [];
    screenFramesRef.current = [];
    lastScreenCaptureTsRef.current = 0;
    blinkClosedRef.current = false;
    lastBlinkTsRef.current = 0;
    setSeconds(0);
    setSampleCount(0);
    setFaceNow(false);
    setPhoneNow(false);
    setPostureNow("unknown");
    setAttentionNow(false);
    setBlinkRateNow(0);
    setPerclosNow(0);
    setHeadDriftNow("0 / 0 / 0");
    setBrowNow(0);
    setJawNow(0);
    setLookAwaySpikes(0);
    setScreenFrameCount(0);
    stopAlarm();
  }

  function createSample() {
    const video = videoRef.current;
    const faceLandmarker = faceLandmarkerRef.current;
    const poseLandmarker = poseLandmarkerRef.current;
    const objectDetector = objectDetectorRef.current;

    if (!video || !faceLandmarker || !poseLandmarker) return null;

    const now = getWallClockTime();
    const visibility = document.visibilityState === "hidden" ? "hidden" : "visible";
    const faceResult = withSuppressedMediapipeLogs(() =>
      faceLandmarker.detectForVideo(video, getVideoClockTime())
    );
    const poseResult = withSuppressedMediapipeLogs(() =>
      poseLandmarker.detectForVideo(video, getVideoClockTime())
    );
    const objectResult = objectDetector
      ? withSuppressedMediapipeLogs(() => objectDetector.detectForVideo(video, getVideoClockTime()))
      : null;

    const hasFace = (faceResult.faceLandmarks?.[0]?.length ?? 0) > 0;
    const phoneDetected =
      objectResult?.detections?.some((detection) =>
        (detection.categories ?? []).some((category) => isPhoneCategory(category.categoryName))
      ) ?? false;
    const blendshapes = faceResult.faceBlendshapes?.[0];
    const headPose = deriveHeadPose(faceResult.facialTransformationMatrixes?.[0]);
    const blinkLeft = getBlendshapeScore(blendshapes, ["eyeBlinkLeft"]);
    const blinkRight = getBlendshapeScore(blendshapes, ["eyeBlinkRight"]);
    const eyeClosure = round(clamp((blinkLeft + blinkRight) / 2, 0, 1), 3);
    const perclosClosed = eyeClosure >= 0.38;
    const browFurrow = round(
      clamp(getBlendshapeScore(blendshapes, ["browDownLeft", "browDownRight"]), 0, 1),
      3
    );
    const mouthPress = getBlendshapeScore(blendshapes, ["mouthPressLeft", "mouthPressRight"]);
    const jawOpen = getBlendshapeScore(blendshapes, ["jawOpen"]);
    const jawClench = round(clamp(Math.max(mouthPress, 0.6 - jawOpen), 0, 1), 3);
    const posture = derivePosture(poseResult.landmarks?.[0]);
    const attentionLikely = visibility === "visible" && hasFace && !phoneDetected;

    let blinkEvent = false;
    if (eyeClosure >= 0.55 && !blinkClosedRef.current && now - lastBlinkTsRef.current >= 180) {
      blinkClosedRef.current = true;
      lastBlinkTsRef.current = now;
      blinkEvent = true;
    } else if (eyeClosure <= 0.2) {
      blinkClosedRef.current = false;
    }

    return {
      ts: now,
      facePresent: hasFace,
      phoneDetected,
      visibilityState: visibility,
      attentionLikely,
      eyeClosure,
      perclosClosed,
      blinkScore: eyeClosure,
      blinkEvent,
      headPose,
      browFurrow,
      jawClench,
      posture: posture.posture,
      shoulderTilt: posture.shoulderTilt,
    } satisfies TelemetrySample;
  }

  async function runDetection() {
    if (!sessionRunningRef.current) return;

    try {
      const sample = createSample();
      if (!sample) {
        setStatus("Landmarker state is not ready.");
        pauseSession();
        return;
      }

      samplesRef.current.push(sample);
      const summary = computeTelemetrySummary({
        samples: samplesRef.current,
        visibilityEvents: visibilityEventsRef.current,
        totalSeconds: Math.floor(getElapsedMs() / 1000),
      });

      setFaceNow(sample.facePresent);
      setPhoneNow(sample.phoneDetected);
      setPostureNow(sample.posture);
      setAttentionNow(sample.attentionLikely);
      setBlinkRateNow(summary.blinkRatePerMinute);
      setPerclosNow(summary.perclos);
      setHeadDriftNow(
        `${Math.abs(sample.headPose.pitch).toFixed(0)} / ${Math.abs(sample.headPose.yaw).toFixed(0)} / ${Math.abs(sample.headPose.roll).toFixed(0)}`
      );
      setBrowNow(sample.browFurrow);
      setJawNow(sample.jawClench);
      setSampleCount(samplesRef.current.length);
      setLookAwaySpikes(summary.lookAwaySpikes);

      const headDrift = Math.max(
        Math.abs(sample.headPose.pitch),
        Math.abs(sample.headPose.yaw),
        Math.abs(sample.headPose.roll)
      );
      if (screenShareEnabled) {
        if (sample.phoneDetected) {
          captureScreenFrame("phone detected during study");
        } else if (sample.jawClench >= 0.56) {
          captureScreenFrame("jaw clench spike");
        } else if (sample.browFurrow >= 0.46) {
          captureScreenFrame("confusion cue spike");
        } else if (headDrift >= 22) {
          captureScreenFrame("head drift spike");
        } else if (!sample.attentionLikely || sample.visibilityState === "hidden") {
          captureScreenFrame("attention continuity dropped");
        }
      }

      const guardAlertReason = buildGuardAlertReason();
      if (guardAlertReason) {
        await startAlarm(guardAlertReason);
      } else {
        stopAlarm();
      }
    } catch (error) {
      console.error(error);
      setStatus("Vision telemetry failed during the session. Check the console for details.");
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

      setStatus("Loading face, pose, and phone detectors...");
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      const [faceLandmarker, poseLandmarker, objectDetector] = await Promise.all([
        withSuppressedMediapipeLogs(() =>
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: FACE_LANDMARKER_MODEL_URL,
            },
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
            runningMode: "VIDEO",
          })
        ),
        withSuppressedMediapipeLogs(() =>
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: POSE_LANDMARKER_MODEL_URL,
            },
            numPoses: 1,
            runningMode: "VIDEO",
          })
        ),
        withSuppressedMediapipeLogs(() =>
          ObjectDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: OBJECT_DETECTOR_MODEL_URL,
            },
            scoreThreshold: 0.35,
            runningMode: "VIDEO",
            maxResults: 4,
          })
        ),
      ]);

      streamRef.current = nextStream;
      faceLandmarkerRef.current = faceLandmarker;
      poseLandmarkerRef.current = poseLandmarker;
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

  async function enableScreenShare() {
    if (screenShareEnabled) return;

    try {
      setStatus("Requesting screen-share permission...");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 6, max: 8 },
        },
        audio: false,
      });

      const video = screenVideoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      const [track] = stream.getVideoTracks();
      if (track) {
        track.addEventListener("ended", () => {
          screenStreamRef.current?.getTracks().forEach((entry) => entry.stop());
          screenStreamRef.current = null;
          clearScreenCaptureLoop();
          setScreenShareEnabled(false);
          setStatus("Screen sharing stopped.");
        });
      }

      screenStreamRef.current = stream;
      setScreenShareEnabled(true);
      setStatus("Screen sharing enabled. Laminar.AI will sample a few frames during the session.");
    } catch (error) {
      console.error(error);
      setStatus("Screen-share setup failed or was cancelled.");
    }
  }

  function captureScreenFrame(note: string, force = false) {
    const video = screenVideoRef.current;
    const canvas = screenCanvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !screenShareEnabled) return;

    const now = getWallClockTime();
    if (!force && now - lastScreenCaptureTsRef.current < EVENT_CAPTURE_COOLDOWN_MS) {
      return;
    }

    const targetWidth = 1440;
    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const scale = Math.min(1, targetWidth / sourceWidth);
    const width = Math.max(320, Math.round(sourceWidth * scale));
    const height = Math.max(180, Math.round(sourceHeight * scale));

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    const nextFrame: ScreenFrameSample = {
      id: crypto.randomUUID(),
      ts: now,
      dataUrl,
      width,
      height,
      note,
    };

    const nextFrames = [...screenFramesRef.current, nextFrame]
      .sort((left, right) => left.ts - right.ts)
      .slice(-MAX_SCREEN_FRAMES);

    screenFramesRef.current = nextFrames;
    lastScreenCaptureTsRef.current = nextFrame.ts;
    setScreenFrameCount(nextFrames.length);
  }

  function runScreenCaptureLoop() {
    if (!sessionRunningRef.current || !screenShareEnabled) return;

    const latestSample = samplesRef.current[samplesRef.current.length - 1] ?? null;
    const note = latestSample
      ? latestSample.phoneDetected
        ? "phone detected in frame"
        : !latestSample.attentionLikely
          ? "attention dropped"
          : latestSample.browFurrow >= 0.35
            ? "confusion cue visible"
            : "stable segment"
      : "session capture";

    captureScreenFrame(note, true);
    screenCaptureTimeoutRef.current = window.setTimeout(runScreenCaptureLoop, SCREEN_CAPTURE_INTERVAL_MS);
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
        currentRun.webcamSessionId !== null;

      if (shouldStartFreshRun) {
        startFreshStudyRun(currentSetup);
      }

      visibilityEventsRef.current.push({
        ts: getWallClockTime(),
        state: document.visibilityState === "hidden" ? "hidden" : "visible",
      });
    }

    runStartedAtRef.current = getWallClockTime();
    sessionRunningRef.current = true;
    setSessionRunning(true);
    setStatus(isNewSession ? "Session running..." : "Session resumed...");
    void primeAlarmAudio();
    startTimer();
    clearDetectLoop();
    clearScreenCaptureLoop();
    void runDetection();
    if (screenShareEnabled) {
      runScreenCaptureLoop();
    }
  }

  function pauseSession() {
    if (!sessionRunningRef.current) return;

    sessionRunningRef.current = false;
    setSessionRunning(false);
    commitElapsedTime();
    clearDetectLoop();
    clearScreenCaptureLoop();
    clearTimer();
    stopAlarm();
    setStatus("Session paused.");
  }

  async function endAndAnalyze() {
    if (!cameraEnabled || sampleCount === 0 || isWrappingUp) return;

    pauseSession();
    setIsWrappingUp(true);
    setStatus("Wrapping the session into a diagnostic report...");

    const activeRun = getStoredStudyRun() ?? startFreshStudyRun(currentSetup);
    const totalSeconds = Math.floor(getElapsedMs() / 1000);
    const samples = [...samplesRef.current];
    const visibilityEvents = [...visibilityEventsRef.current];
    if (screenShareEnabled) {
      captureScreenFrame("session wrap-up", true);
    }
    const screenFrames = [...screenFramesRef.current];
    const significantEvents = deriveSignificantEvents({
      samples,
      visibilityEvents,
      screenFrames,
    });
    const summary = computeTelemetrySummary({
      samples,
      visibilityEvents,
      screenFrames,
      totalSeconds,
    });

    let diagnosticReport: DiagnosticReport | null = null;

    try {
      const response = await fetch("/api/ai/diagnostic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studyRunId: activeRun.studyRunId,
          setup: currentSetup,
          summary,
          significantEvents: significantEvents.map((event) => ({
            id: event.id,
            ts: event.ts,
            kind: event.kind,
            title: event.title,
            detail: event.detail,
            severity: event.severity,
            screenFrameId: event.screenFrameId ?? null,
          })),
          screenFrames: screenFrames.map((frame, index) => ({
            id: frame.id,
            ts: frame.ts,
            dataUrl: frame.dataUrl,
            note:
              frame.note ??
              (index === 0
                ? "earlier captured screen context"
                : index === screenFrames.length - 1
                  ? "later captured screen context"
                  : "mid-session captured screen context"),
          })),
        }),
      });
      const payload = (await response.json()) as
        | { report?: DiagnosticReport; error?: string }
        | undefined;

      if (!response.ok || !payload?.report) {
        throw new Error(payload?.error || "AI diagnostic generation failed.");
      }

      diagnosticReport = payload.report;
      setStatus("Diagnostic report generated.");
    } catch (error) {
      console.error(error);
      diagnosticReport = deriveFallbackDiagnostic({
        setup: currentSetup,
        summary,
      });
      setStatus("AI diagnostic failed, so Laminar.AI saved a local fallback report instead.");
    }

    const payload: WebcamSession = {
      sessionId: crypto.randomUUID(),
      studyRunId: activeRun.studyRunId,
      createdAt: getWallClockTime(),
      totalSeconds,
      studyMode: normalizeStudyMode(currentSetup?.studyMode),
      samples,
      visibilityEvents,
      screenFrames: [],
      summary,
      diagnosticReport,
      setupSnapshot: currentSetup,
    };

    setStoredJson(STORAGE_KEYS.attentionLast, payload);

    const history = getStoredJson<WebcamSession[]>(
      STORAGE_KEYS.attentionHistory,
      [],
      (value): value is WebcamSession[] =>
        Array.isArray(value) && value.every((entry) => isWebcamSessionLike(entry))
    );
    history.unshift(payload);
    setStoredJson(STORAGE_KEYS.attentionHistory, history.slice(0, 20));
    upsertCurrentStudyRun({
      studyRunId: activeRun.studyRunId,
      setup: currentSetup,
      webcamSessionId: payload.sessionId,
      webcamCompletedAt: payload.createdAt,
    });

    setIsWrappingUp(false);
    router.push("/dashboard");
  }

  useEffect(() => {
    const currentVideo = videoRef.current;
    const currentScreenVideo = screenVideoRef.current;

    return () => {
      clearDetectLoop();
      clearScreenCaptureLoop();
      clearTimer();
      stopAlarm();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      faceLandmarkerRef.current?.close();
      poseLandmarkerRef.current?.close();
      objectDetectorRef.current?.close();
      if (alarmContextRef.current) {
        void alarmContextRef.current.close();
        alarmContextRef.current = null;
      }

      if (currentVideo) {
        currentVideo.srcObject = null;
      }
      if (currentScreenVideo) {
        currentScreenVideo.srcObject = null;
      }
    };
  }, []);

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  const studyModeLabel =
    currentSetup?.studyMode
      ? currentSetup.studyMode.replace(/-/g, " ")
      : "video lecture";

  if (!currentProfile) {
    return (
      <ProfileRequired
        title="Pick a profile before starting a webcam session."
        description="Webcam telemetry and study runs are stored per person."
      />
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="panel flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="eyebrow">Laminar.AI</p>
            <h1 className="section-title">Vision Telemetry Session</h1>
            <p className="section-copy">
              Run a local webcam session to track focus, fatigue, posture, and attention drift
              across any study medium without uploading video.
            </p>
            {currentSetup ? (
              <div className="rounded-2xl bg-slate-950/5 px-4 py-3 text-sm text-slate-700">
                {currentSetup.studentName} is in {studyModeLabel} mode for {currentSetup.moduleName} (
                {currentSetup.topic}) with {getGuardStyleLabel(getCurrentGuardStyle())} active.
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No study plan is saved yet. You can still record a session, but the diagnostic is
                stronger when the study mode is configured first.
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
                value={getGuardStyleLabel(getCurrentGuardStyle())}
              />
              <StatusRow label="Camera" value={cameraEnabled ? "Enabled" : "Off"} />
              <StatusRow label="Screen share" value={screenShareEnabled ? "Enabled" : "Off"} />
              <StatusRow label="Face detected now" value={faceNow ? "Yes" : "No"} />
              <StatusRow label="Phone detected now" value={phoneNow ? "Yes" : "No"} />
              <StatusRow
                label="Attention continuity now"
                value={attentionNow ? "Likely focused" : "Dropped / away"}
              />
              <StatusRow label="Visibility state" value={visibilityState} />
              <StatusRow
                label="Head drift (pitch / yaw / roll)"
                value={headDriftNow}
              />
              <StatusRow label="Blink rate" value={`${blinkRateNow} / min`} />
              <StatusRow label="PERCLOS" value={`${Math.round(perclosNow * 100)}%`} />
              <StatusRow label="Brow furrow" value={`${Math.round(browNow * 100)}%`} />
              <StatusRow label="Jaw clench" value={`${Math.round(jawNow * 100)}%`} />
              <StatusRow label="Posture" value={postureNow} />
              <StatusRow label="Look-away spikes" value={String(lookAwaySpikes)} />
              <StatusRow label="Captured screen frames" value={String(screenFrameCount)} />
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
              Privacy note: Laminar.AI stores only timestamped telemetry such as blink rate,
              posture, head-pose drift, and visibility changes on this device. Webcam video is
              never uploaded or saved. Shared-screen snapshots are only attached if you explicitly
              enable screen sharing.
            </div>

            <div className="rounded-2xl bg-[#0f3d3e]/8 px-4 py-3 text-sm text-slate-700">
              Laminar.AI sends one wrap-up call after the session ends. The raw camera stream stays
              local throughout the study block, while shared-screen frames are only sent for event
              correlation if you opted in.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="button-secondary"
                disabled={cameraEnabled || isWrappingUp}
                onClick={enableCamera}
                type="button"
              >
                {cameraEnabled ? "Camera Ready" : "Enable Camera"}
              </button>

              <button
                className="button-primary"
                disabled={screenShareEnabled || isWrappingUp}
                onClick={enableScreenShare}
                type="button"
              >
                {screenShareEnabled ? "Screen Shared" : "Share Study Screen"}
              </button>

              <button
                className="button-primary"
                disabled={!cameraEnabled || sessionRunning || isWrappingUp}
                onClick={startOrResumeSession}
                type="button"
              >
                {sampleCount > 0 ? "Resume Session" : "Start Session"}
              </button>

              <button
                className="button-secondary"
                disabled={!sessionRunning || isWrappingUp}
                onClick={pauseSession}
                type="button"
              >
                Pause
              </button>

              <button
                className="rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!cameraEnabled || sampleCount === 0 || isWrappingUp}
                onClick={endAndAnalyze}
                type="button"
              >
                {isWrappingUp ? "Wrapping up..." : "End and analyze"}
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
            <video ref={screenVideoRef} className="hidden" playsInline muted />
            <canvas ref={screenCanvasRef} className="hidden" />
            <div className="rounded-2xl bg-[#0f3d3e]/8 px-4 py-3 text-sm text-slate-700">
              Demo tip: share the study screen if you want topic-level correlation, then turn your
              head away, briefly leave the tab, hold up a phone, or slump in your seat to create
              clearer telemetry. Laminar.AI will try to connect the visible material to the exact
              moments where focus quality changed.
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
      <span className="font-medium text-right text-slate-900">{value}</span>
    </div>
  );
}
