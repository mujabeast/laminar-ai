let audioContext = null;
let gainNode = null;
let oscillators = [];
let isAlarmActive = false;

async function ensureContext() {
  if (!audioContext) {
    const AudioContextCtor = self.AudioContext || self.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }
    audioContext = new AudioContextCtor();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  return audioContext;
}

async function startAlarm() {
  if (isAlarmActive) return;

  const context = await ensureContext();
  if (!context) return;

  gainNode = context.createGain();
  gainNode.gain.value = 0.18;
  gainNode.connect(context.destination);

  const low = context.createOscillator();
  low.type = "square";
  low.frequency.value = 660;
  low.connect(gainNode);

  const high = context.createOscillator();
  high.type = "sawtooth";
  high.frequency.value = 990;
  high.connect(gainNode);

  low.start();
  high.start();

  oscillators = [low, high];
  isAlarmActive = true;
}

function stopAlarm() {
  for (const oscillator of oscillators) {
    try {
      oscillator.stop();
    } catch {}
    try {
      oscillator.disconnect();
    } catch {}
  }

  oscillators = [];

  if (gainNode) {
    try {
      gainNode.disconnect();
    } catch {}
    gainNode = null;
  }

  isAlarmActive = false;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "OFFSCREEN_ALARM") {
    return false;
  }

  (async () => {
    if (message.payload?.active) {
      await startAlarm();
    } else {
      stopAlarm();
    }

    sendResponse({ ok: true });
  })().catch((error) => {
    console.error(error);
    sendResponse({ ok: false, reason: String(error) });
  });

  return true;
});
