Below is a **handover report** from a chatgpt conversation.

---

# STUDYOS PROJECT HANDOVER REPORT (Copy-Paste to New Chat)

## 0) Project Goal (What we are building)

We are building a web app + Chrome extension called **StudyOS: Attention Mirror / Dual-Signal Habit Tracker**.

**Core idea (unique + not an AI tutor):**
Instead of generating study plans or teaching content, the system measures **how you actually study** using two signals:

1. **Webcam “Attention Mirror”**

* Detects if face is present (proxy for attention)
* Measures look-away spikes, late-session attention crash
* Produces a “Failure Mode” label and a “Micro-Patch” (habit fix)

2. **Chrome Extension “Screen Behavior Recorder”**

* Logs tab switching behavior and time spent by domain
* Logs video pause/seek events (friction points) from HTML5 video players (YouTube works)
* Exports JSON which is imported into the webapp

Then the dashboard fuses both signals into “fusion failure modes”:

* **Friction Escaper** (pause/seek bursts → then tab switches to entertainment)
* **Helper Overdoser** (pause/seek bursts → then tab switches to ChatGPT/helper and stays there)
* **Micro-Fractured** (very high tab switching rate regardless of friction)
* **Late Crasher** (webcam attention drops late + tab switching rises)
* **Seat-Leaver** (very low webcam attention)
* **Deep Worker** (good baseline)

**The output is actionable:** 1 micro-patch (short protocol) tailored to the detected mode.

No backend required (MVP stores to localStorage and uses extension export/import).

---

## 1) Current Status: What is implemented and working

### ✅ Webapp runs locally

* `npm install`
* `npm run dev`
* Open `http://localhost:3000`

### ✅ Webcam Session Page works

Path: `webapp/src/app/session/page.tsx`
Uses **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision`), in-browser face detection.
Records samples: `[{ ts, facePresent }]` each animation frame.
Saves:

* last session: `localStorage["studyos_attention_last"]`
* history: `localStorage["studyos_attention_history"]`

### ✅ Import Page works

Path: `webapp/src/app/import/page.tsx`
User uploads extension-exported JSON file.
Stores:

* last import: `localStorage["studyos_extension_last"]`
* extension history: `localStorage["studyos_extension_history"]`
  Shows quick summary (currently shows minutes; user requested adding seconds too).

### ✅ Fusion Dashboard works (but file placement got mixed up)

Dashboard file contains fusion logic:

* Reads webcam data from `studyos_attention_last`
* Reads extension import from `studyos_extension_last`
* Computes:

  * webcam attention %
  * look-away spikes
  * late crash
  * tab switching rate (switches / 10 min)
  * friction clusters from pause/seek events
  * minutes by domain type (study/helper/sedative/other)
  * friction→sedative count and friction→helper count
* Produces fusion failure mode and micro-patch steps

**Important:** At some point the user accidentally pasted dashboard code into `app/page.tsx` (homepage). This must be fixed:

* Homepage must be simple landing page.
* Dashboard code must be placed at `app/dashboard/page.tsx`.

### ✅ Chrome Extension works

Folder: `extension/` (sibling of `webapp/`)

Files:

* `manifest.json` (MV3)
* `background.js` (records tab spans + receives video events + export)
* `content.js` (attaches listeners to HTML5 `<video>` events and sends to background)
* `popup.html`, `popup.js` (Start/Stop/Export)

Extension capabilities:

* Logs tab switches and durations by domain (`tabSpans`)
* Logs video events: `pause/play/seeking/seeked/ratechange` (`videoEvents`)
* Export JSON via chrome downloads API

Tested using YouTube (guaranteed HTML5 video).

---

## 2) Folder Structure (expected end state)

Top-level project folder:

```
studyos/
  webapp/
    src/app/
      page.tsx                 <-- HOMEPAGE (landing page)
      session/page.tsx         <-- Webcam session
      dashboard/page.tsx       <-- Fusion dashboard
      import/page.tsx          <-- Import extension JSON
  extension/
    manifest.json
    background.js
    content.js
    popup.html
    popup.js
```

---

## 3) What each page is supposed to do

### A) Homepage (`webapp/src/app/page.tsx`)

Should be a landing page with 3 buttons:

* Start Webcam Session → `/session`
* View Dashboard → `/dashboard`
* Import Extension JSON → `/import`

**Important:** Homepage should NOT contain fusion logic. It is currently accidentally overwritten with dashboard code and must be corrected.

### B) Webcam Session (`/session`)

* Button: enable camera
* Start session → starts timer and detection loop
* End + Analyze → saves to localStorage and redirects to `/dashboard`

### C) Import (`/import`)

* Upload extension JSON
* Save to localStorage
* Show summary: tab spans count, video events count, total tracked time, top domains
  **User request pending:** show seconds in the summary too, not just minutes.

### D) Dashboard (`/dashboard`)

Fusion dashboard:

* Shows webcam metrics + extension metrics
* Shows Fusion Failure Mode + Micro-Patch steps
* Shows top domains (extension)
* Shows webcam session history (last 5)

**User request pending earlier:** show seconds as well (for extension times).

---

## 4) Extension JSON Data format (important for fusion logic)

Exported JSON contains:

* `sessionId`
* `startedAt`, `endedAt`
* `tabEvents`: high-level tab activation events
* `tabSpans`: time spans per domain
  Example:

  ```json
  {
    "startTs": 123,
    "endTs": 456,
    "durationMs": 333,
    "domain": "youtube.com",
    "url": "...",
    "tabId": 123
  }
  ```
* `videoEvents`:
  Example:

  ```json
  {
    "ts": 123,
    "type": "pause",
    "currentTime": 42.1,
    "playbackRate": 1,
    "url": "...",
    "domain": "youtube.com"
  }
  ```

---

## 5) Fusion Logic Summary (how the dashboard decides modes)

### Webcam metrics

* **attention** = facePresent samples / total samples
* **lookAwaySpikes** = face absent for ≥ 2 seconds
* **lateCrash** = attention drops by ≥25% comparing first third vs last third of session

### Extension metrics

* **switchRate** = (tabSpans.length - 1) / (totalTabTime / 10 minutes)
* **frictionClusters** = clusters of pause/seeking/seeked events within 45s window, keep clusters with count ≥ 3
* Domain types:

  * sedative: netflix, tiktok, instagram, reddit, twitch, etc
  * helper: chatgpt/chat.openai.com, perplexity, stackoverflow, github, docs, wikipedia
  * study: ntulearn/ntu/canvas/blackboard/youtube/coursera/edx

### Fusion counts

For each friction cluster, find the next tab span after it ends.
If next span is sedative → increment `frictionToSedative`
If helper → increment `frictionToHelper`

### Failure mode precedence (approx)

* Seat-Leaver if attention < 0.65
* Helper Overdoser if friction clusters exist, frictionToHelper dominates, helper minutes >= 3
* Friction Escaper if friction clusters exist, frictionToSedative dominates
* Late Crasher if lateCrash and switchRate >= 3
* Micro-Fractured if switchRate >= 6
* else Deep Worker

### Micro-Patches (examples)

* Seat-Leaver: Chair Anchor Sprint
* Micro-Fractured: Two-Tab Lock
* Late Crasher: Split-Run Protocol
* Friction Escaper: Friction Label Rule (write 1-line stuck reason before switching)
* Helper Overdoser: Helper Quota (1 min attempt first, 1 precise question, return immediately)
* Deep Worker: Streak Saver

---

## 6) Known Issues / Confusions that must be fixed next

### ✅ BIGGEST ISSUE:

User currently has **dashboard code inside `app/page.tsx`** (homepage).
Fix needed:

* Put the correct landing page code into `webapp/src/app/page.tsx`
* Put the fusion dashboard code into `webapp/src/app/dashboard/page.tsx`

### Feature request pending:

* Import summary should show **seconds** (not just minutes)
* Ideally dashboard’s top domain and minutes-by-type should show seconds too

---

## 7) Last working code state (high level)

* Session page works (MediaPipe face detector)
* Extension works and exports JSON
* Import page works and stores JSON
* Dashboard fusion logic works but file placement messed up
* Need to correct routing files and presentation polish

---

## 8) Next Steps Checklist (for the next assistant)

1. **Fix file placement**

   * Put landing page in `app/page.tsx`
   * Put dashboard in `app/dashboard/page.tsx`
2. **Add Import button on landing page**
3. **Update import summary to show minutes + seconds**
4. **Update dashboard UI to show seconds for extension times**
5. (Optional) GitHub repo + Vercel deployment
6. (Optional) Demo script + judging pitch

