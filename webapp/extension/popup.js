const statusEl = document.getElementById("status");
const studyRunIdEl = document.getElementById("studyRunId");
const tabSpansEl = document.getElementById("tabSpans");
const confusionCapturesEl = document.getElementById("confusionCaptures");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const confusionBtn = document.getElementById("confusion");
const exportBtn = document.getElementById("export");

function setStatus(text) {
  statusEl.textContent = `Status: ${text}`;
}

function shortenRunId(value) {
  if (!value) return "-";
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function setCounts({ studyRunId = null, tabSpans = 0, confusionCaptures = 0 }) {
  studyRunIdEl.textContent = shortenRunId(studyRunId);
  tabSpansEl.textContent = String(tabSpans);
  confusionCapturesEl.textContent = String(confusionCaptures);
}

function setButtons(isRecording) {
  startBtn.disabled = isRecording;
  stopBtn.disabled = !isRecording;
  confusionBtn.disabled = !isRecording;
}

function send(type) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, reason: chrome.runtime.lastError.message });
        return;
      }

      resolve(response || { ok: false, reason: "no_response" });
    });
  });
}

async function refresh() {
  const response = await send("GET_STATUS");

  if (!response?.ok) {
    setStatus("background worker unavailable");
    setCounts({});
    setButtons(false);
    return;
  }

  setStatus(
    response.alarmActive ? "lock-in alarm active" : response.isRecording ? "recording" : "idle"
  );
  setCounts(response);
  setButtons(!!response.isRecording);
}

startBtn.addEventListener("click", async () => {
  setStatus("starting...");
  await send("START");
  await refresh();
});

stopBtn.addEventListener("click", async () => {
  setStatus("stopping...");
  await send("STOP");
  await refresh();
});

confusionBtn.addEventListener("click", async () => {
  setStatus("capturing confusion...");
  const response = await send("CAPTURE_CONFUSION");
  setStatus(response?.ok ? "confusion saved" : "capture failed");
  await refresh();
});

exportBtn.addEventListener("click", async () => {
  setStatus("preparing export...");
  const response = await send("EXPORT");
  setStatus(response?.ok ? "export started" : "export failed");
  await refresh();
});

refresh();
