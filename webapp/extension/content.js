function safeSend(payload) {
  try {
    chrome.runtime.sendMessage(payload, () => {
      // ignore response
    });
  } catch {}
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  const message = event.data;
  if (!message || message.source !== "studyos-webapp" || message.type !== "STUDYOS_SYNC_RUN") {
    return;
  }

  safeSend({
    type: "SYNC_RUN_CONTEXT",
    payload: message.payload,
  });
});
