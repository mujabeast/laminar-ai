# Laminar.AI Testbench Setup And Run

This document is the judge-facing step-by-step guide for running Laminar.AI.

## 1. Repository Layout

The repository root contains:

- `webapp/`: the actual Next.js app
- `testbench/`: this setup guide and env template

All commands below should be run inside:

```bash
webapp
```

## 2. Requirements

- Node.js 20 or newer recommended
- npm
- An OpenAI API key
- A laptop/desktop with webcam access
- A modern Chromium-based browser is recommended for the webcam and screen-share flow

## 3. Install Dependencies

Open a terminal in `webapp/` and run:

```bash
npm install
```

## 4. Environment Variables

Copy:

```text
testbench/env.example
```

into:

```text
webapp/.env.local
```

Then fill in at minimum:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_RESPONSES_MODEL=gpt-4.1-mini
```

Notes:

- `OPENAI_BASE_URL` can be left blank for normal OpenAI usage.
- Azure-related variables are optional and not required for the default setup.

## 5. Run The App

From `webapp/`, run:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## 6. Optional Validation Checks

From `webapp/`, the project can also be checked with:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## 7. Main Test Flow

Use this if you want to test the focus diagnostics flow.

1. Open Laminar.AI in the browser.
2. Create or select a profile.
3. Choose `I keep getting distracted`.
4. Open the focus setup page.
5. Fill in:
   - student name
   - module
   - topic
   - study mode
   - optional study source
   - guard style
6. Start the webcam session.
7. Grant webcam permission when prompted.
8. Optionally click the screen-share control and share the study screen if you want event-to-screen correlation.
9. End the session after enough telemetry has been collected.
10. Open the dashboard and review:
   - session context
   - AI diagnostic
   - telemetry visuals
   - event-to-screen matches

## 8. Academic Test Flow

Use this if you want to test the academic weakness pipeline.

1. Open Laminar.AI.
2. Choose `I don't understand this topic`.
3. Enter:
   - student name
   - topic
   - what is confusing
   - optional uploaded materials
4. Submit the understanding flow.
5. Open the Academic Dashboard.
6. Review:
   - merged weakness items
   - AI overview
   - mastery checkboxes

## 9. Combined History Flow

1. Complete at least 2 focus sessions.
2. Complete at least 1 academic understanding entry.
3. Open `History`.
4. Verify that the page shows:
   - combined attention and academic visuals
   - progress summary
   - cross-signal observations

## 10. Important Product Limitations

This prototype currently uses browser local storage.

That means:

- data is stored per browser/device
- profiles are local only
- judges testing on one machine will not see data from another machine
- clearing browser storage will remove saved local data

## 11. Deployment Note

If a judge or tester wants to deploy it to Vercel:

1. Import the repository into Vercel.
2. Set `Root Directory` to `webapp`.
3. Add the same environment variables from `.env.local`.
4. Deploy as a Next.js project.
5. tbh you can also just click here https://laminar-ai.vercel.app/ i used 9 cents from my credits so go crazy!!
