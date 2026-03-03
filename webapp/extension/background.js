const STORAGE_SESSION_KEY = "studyos_session";
const STORAGE_RECORDING_KEY = "studyos_recording";
const STORAGE_LAST_ACTIVE_KEY = "studyos_last_active";
const STORAGE_LINKED_RUN_KEY = "studyos_linked_run";
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

let isRecording = false;
let session = createEmptySession();
let lastActive = createEmptyActive();
let linkedRun = createEmptyLinkedRun();
let alarmState = { active: false, reason: "" };
let offscreenReadyPromise = null;

const initPromise = hydrateState();

function now() {
  return Date.now();
}

function createEmptySession() {
  return {
    sessionId: null,
    studyRunId: null,
    startedAt: null,
    endedAt: null,
    tabEvents: [],
    tabSpans: [],
    confusionCaptures: [],
    setupSnapshot: null,
  };
}

function createEmptyActive() {
  return {
    tabId: null,
    url: null,
    domain: null,
    startTs: null,
    reason: null,
  };
}

function createEmptyLinkedRun() {
  return {
    studyRunId: null,
    setupSnapshot: null,
    syncedAt: null,
  };
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function normalizeDomain(value) {
  if (!value || typeof value !== "string") return "";

  try {
    const withProtocol = value.startsWith("http") ? value : `https://${value}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return value.replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  }
}

function domainMatchesFocus(domain, focusDomain) {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedFocus = normalizeDomain(focusDomain);
  if (!normalizedFocus) return false;

  return (
    normalizedDomain === normalizedFocus ||
    normalizedDomain.endsWith(`.${normalizedFocus}`) ||
    normalizedFocus.endsWith(`.${normalizedDomain}`)
  );
}

function countAwaySwitchActivations(tabEvents, tabSpans, focusDomain) {
  const normalizedFocus = normalizeDomain(focusDomain);

  if (Array.isArray(tabEvents) && tabEvents.length) {
    if (!normalizedFocus) {
      return tabEvents.filter((event) => event.type === "tab_activated").length;
    }

    return tabEvents.filter(
      (event) =>
        event.type === "tab_activated" &&
        !domainMatchesFocus(event.domain || "", normalizedFocus)
    ).length;
  }

  const spans = Array.isArray(tabSpans) ? [...tabSpans].sort((a, b) => a.startTs - b.startTs) : [];
  if (!spans.length) return normalizedFocus ? 0 : null;
  if (!normalizedFocus) return Math.max(0, spans.length - 1);

  let count = 0;
  for (let index = 0; index < spans.length - 1; index += 1) {
    if (
      domainMatchesFocus(spans[index].domain || "", normalizedFocus) &&
      !domainMatchesFocus(spans[index + 1].domain || "", normalizedFocus)
    ) {
      count += 1;
    }
  }

  return count;
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) {
    return false;
  }

  const documentUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [documentUrl],
  });

  if (existing.length > 0) {
    return true;
  }

  if (!offscreenReadyPromise) {
    offscreenReadyPromise = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play the lock-in alarm when the student exceeds the configured distraction limit.",
      })
      .finally(() => {
        offscreenReadyPromise = null;
      });
  }

  await offscreenReadyPromise;
  return true;
}

async function setAlarmPlayback(active, reason = "") {
  if (alarmState.active === active && alarmState.reason === reason) {
    return;
  }

  alarmState = { active, reason };

  await chrome.action.setBadgeText({ text: active ? "ALRM" : "" });
  if (active) {
    await chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
  }

  try {
    const ready = await ensureOffscreenDocument();
    if (ready) {
      await chrome.runtime.sendMessage({
        type: "OFFSCREEN_ALARM",
        payload: { active, reason },
      });
    }
  } catch {}
}

async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function getCurrentActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ?? null;
  } catch {
    return null;
  }
}

async function persistState() {
  await chrome.storage.local.set({
    [STORAGE_SESSION_KEY]: session,
    [STORAGE_RECORDING_KEY]: isRecording,
    [STORAGE_LAST_ACTIVE_KEY]: isRecording ? lastActive : createEmptyActive(),
    [STORAGE_LINKED_RUN_KEY]: linkedRun,
  });
}

function resetSession() {
  session = {
    sessionId: crypto.randomUUID(),
    studyRunId: linkedRun.studyRunId || `run_${Date.now()}_${crypto.randomUUID()}`,
    startedAt: now(),
    endedAt: null,
    tabEvents: [],
    tabSpans: [],
    confusionCaptures: [],
    setupSnapshot: linkedRun.setupSnapshot || null,
  };
  lastActive = createEmptyActive();
}

function closeActiveSpan() {
  if (!lastActive.startTs) return;

  const endTs = now();
  session.tabSpans.push({
    startTs: lastActive.startTs,
    endTs,
    durationMs: endTs - lastActive.startTs,
    domain: lastActive.domain,
    url: lastActive.url,
    tabId: lastActive.tabId,
    reason: lastActive.reason || "activation",
  });

  lastActive = createEmptyActive();
}

function openActiveSpan({ tabId, url, reason }) {
  lastActive = {
    tabId,
    url,
    domain: getDomain(url),
    startTs: now(),
    reason,
  };
}

async function hydrateState() {
  const stored = await chrome.storage.local.get([
    STORAGE_SESSION_KEY,
    STORAGE_RECORDING_KEY,
    STORAGE_LAST_ACTIVE_KEY,
    STORAGE_LINKED_RUN_KEY,
  ]);

  isRecording = !!stored[STORAGE_RECORDING_KEY];
  session = stored[STORAGE_SESSION_KEY] || createEmptySession();
  lastActive = stored[STORAGE_LAST_ACTIVE_KEY] || createEmptyActive();
  linkedRun = stored[STORAGE_LINKED_RUN_KEY] || createEmptyLinkedRun();

  if (!Array.isArray(session.confusionCaptures)) {
    session.confusionCaptures = [];
  }

  if (!("studyRunId" in session)) {
    session.studyRunId = linkedRun.studyRunId || null;
  }

  if (!("setupSnapshot" in session)) {
    session.setupSnapshot = linkedRun.setupSnapshot || null;
  }

  if (isRecording && !lastActive.startTs) {
    const tab = await getCurrentActiveTab();
    if (tab?.id != null && tab.url) {
      openActiveSpan({ tabId: tab.id, url: tab.url, reason: "activation" });
      await persistState();
    }
  }

  await reevaluateLockInAlarm();
}

async function startRecording() {
  await initPromise;
  if (isRecording) return;

  resetSession();
  isRecording = true;

  const tab = await getCurrentActiveTab();
  if (tab?.id != null && tab.url) {
    openActiveSpan({ tabId: tab.id, url: tab.url, reason: "start" });
    session.tabEvents.push({
      ts: now(),
      type: "recording_start",
      tabId: tab.id,
      url: tab.url,
      domain: getDomain(tab.url),
    });
  } else {
    session.tabEvents.push({ ts: now(), type: "recording_start" });
  }

  await persistState();
  await reevaluateLockInAlarm();
}

async function stopRecording() {
  await initPromise;
  if (!isRecording) return;

  closeActiveSpan();
  session.endedAt = now();
  session.tabEvents.push({ ts: now(), type: "recording_stop" });
  isRecording = false;
  await persistState();
  await setAlarmPlayback(false);
}

async function handleTabActivation(tabId) {
  await initPromise;
  if (!isRecording) return;

  const tab = await getTab(tabId);
  const url = tab?.url || "unknown";

  if (lastActive.tabId === tabId && lastActive.url === url) return;

  closeActiveSpan();
  openActiveSpan({ tabId, url, reason: "activation" });

  session.tabEvents.push({
    ts: now(),
    type: "tab_activated",
    tabId,
    url,
    domain: getDomain(url),
  });

  await persistState();
  await reevaluateLockInAlarm();
}

async function handleNavigation(tabId, url) {
  await initPromise;
  if (!isRecording) return;
  if (lastActive.tabId !== tabId) return;
  if (!url || lastActive.url === url) return;

  closeActiveSpan();
  openActiveSpan({ tabId, url, reason: "navigation" });

  session.tabEvents.push({
    ts: now(),
    type: "tab_navigated",
    tabId,
    url,
    domain: getDomain(url),
  });

  await persistState();
  await reevaluateLockInAlarm();
}

async function handleTabRemoved(tabId) {
  await initPromise;
  if (!isRecording) return;
  if (lastActive.tabId !== tabId) return;

  closeActiveSpan();
  await persistState();
  await reevaluateLockInAlarm();
}

function buildExportSnapshot() {
  const snapshot = {
    ...session,
    tabEvents: [...session.tabEvents],
    tabSpans: [...session.tabSpans],
    confusionCaptures: [...(session.confusionCaptures || [])],
  };

  if (isRecording && lastActive.startTs) {
    const endTs = now();
    snapshot.tabSpans.push({
      startTs: lastActive.startTs,
      endTs,
      durationMs: endTs - lastActive.startTs,
      domain: lastActive.domain,
      url: lastActive.url,
      tabId: lastActive.tabId,
      reason: lastActive.reason || "activation",
    });
  }

  return snapshot;
}

async function reevaluateLockInAlarm(snapshot = buildExportSnapshot()) {
  const setup = linkedRun.setupSnapshot || session.setupSnapshot;

  if (!isRecording || !setup || setup.guardStyle !== "lock-in") {
    await setAlarmPlayback(false);
    return;
  }

  const awaySwitches = countAwaySwitchActivations(
    snapshot.tabEvents || [],
    snapshot.tabSpans || [],
    setup.focusDomain
  );
  const isOverLimit =
    typeof awaySwitches === "number" && awaySwitches > Math.max(0, setup.maxTabSwitches || 0);
  const isAwayFromFocus = !domainMatchesFocus(lastActive.domain || "", setup.focusDomain || "");

  await setAlarmPlayback(
    isOverLimit && isAwayFromFocus,
    `Tab limit exceeded. Return to ${normalizeDomain(setup.focusDomain || "the study tab")} to stop the alarm.`
  );
}

async function captureConfusionMoment() {
  await initPromise;
  if (!isRecording) {
    return { ok: false, reason: "not_recording" };
  }

  const tab = await getCurrentActiveTab();
  if (!tab?.url) {
    return { ok: false, reason: "no_active_tab" };
  }

  const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "jpeg",
    quality: 55,
  });

  session.confusionCaptures.push({
    id: crypto.randomUUID(),
    ts: now(),
    url: tab.url,
    domain: getDomain(tab.url),
    title: tab.title || "Do not understand moment",
    screenshotDataUrl,
  });

  await persistState();

  return {
    ok: true,
    confusionCaptures: session.confusionCaptures.length,
  };
}

function buildStatusResponse() {
  return {
    ok: true,
    isRecording,
    sessionId: session.sessionId,
    studyRunId: session.studyRunId || linkedRun.studyRunId,
    tabSpans: session.tabSpans.length,
    confusionCaptures: session.confusionCaptures.length,
    alarmActive: alarmState.active,
  };
}

async function syncRunContext(payload) {
  if (!payload || typeof payload.studyRunId !== "string") {
    return { ok: false, reason: "invalid_run_context" };
  }

  linkedRun = {
    studyRunId: payload.studyRunId,
    setupSnapshot: payload.setupSnapshot || null,
    syncedAt: payload.syncedAt || now(),
  };

  if (!isRecording) {
    session.studyRunId = linkedRun.studyRunId;
    session.setupSnapshot = linkedRun.setupSnapshot;
  }

  await persistState();
  await reevaluateLockInAlarm();
  return { ok: true, studyRunId: linkedRun.studyRunId };
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  void handleTabActivation(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.active || !tab.url) return;

  void handleNavigation(tabId, tab.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void handleTabRemoved(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await initPromise;

    if (message?.type === "OFFSCREEN_ALARM") {
      return;
    }

    if (message?.type === "START") {
      await startRecording();
      sendResponse(buildStatusResponse());
      return;
    }

    if (message?.type === "STOP") {
      await stopRecording();
      sendResponse(buildStatusResponse());
      return;
    }

    if (message?.type === "GET_STATUS") {
      sendResponse(buildStatusResponse());
      return;
    }

    if (message?.type === "SYNC_RUN_CONTEXT") {
      sendResponse(await syncRunContext(message.payload));
      return;
    }

    if (message?.type === "CAPTURE_CONFUSION") {
      sendResponse(await captureConfusionMoment());
      return;
    }

    if (message?.type === "EXPORT") {
      const data = buildExportSnapshot();
      const json = JSON.stringify(data, null, 2);
      const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;

      await chrome.downloads.download({
        url,
        filename: `studyos_session_${data.sessionId || "unknown"}.json`,
        saveAs: true,
      });

      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, reason: "unknown_message" });
  })().catch((error) => {
    console.error(error);
    sendResponse({ ok: false, reason: String(error) });
  });

  return true;
});
