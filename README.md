# Laminar.AI

Laminar.AI is a study diagnostics web app that helps students understand two things:

1. how their focus changes during study sessions
2. which academic concepts they are repeatedly weak in

It is built as a Next.js web application inside the `webapp/` folder.

## Repository Structure

- `webapp/`: main Next.js application
- `testbench/`: judge-facing setup files and step-by-step run guide

## What The App Does

- Focus setup flow with study modes:
  - Video Lecture
  - Reading/Notes
  - Active Recall/Quiz
  - Problem Solving
- Webcam-based vision telemetry during study sessions
- Optional screen sharing for event-to-screen correlation
- AI-generated attention diagnostic reports
- Understanding Coach for weak-topic intake
- Academic dashboard with merged weak concepts and mastery tracking
- Combined history view that compares attention and academic progress

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- MediaPipe Tasks Vision
- OpenAI Responses API

## Dependencies

Main runtime dependencies are defined in:

- `webapp/package.json`

Key dependencies:

- `next`
- `react`
- `react-dom`
- `@mediapipe/tasks-vision`

## Local Setup

1. Open a terminal in:

```bash
cd webapp
```

2. Install dependencies:

```bash
npm install
```

3. Create a local environment file from the template:

```bash
copy .env.example .env.local
```

4. Open `.env.local` and set at minimum:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_RESPONSES_MODEL=gpt-4.1-mini
```

5. Start the dev server:

```bash
npm run dev
```

6. Open the app in your browser:

```text
http://localhost:3000
```

## Build And Validation

Run these from `webapp/`:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Judge / Testbench Files

The required judge-facing files are in:

- `testbench/SETUP_AND_RUN.md`
- `testbench/env.example`

These explain exactly how to configure and run the project for testing.

## Deployment Note

If deploying this repository to Vercel:

- import the repository
- set `Root Directory` to `webapp`
- add the same environment variables from `.env.local`

## Important Limitations

- User data is currently stored in browser local storage.
- Profiles are local to each browser/device.
- Data is not automatically shared across devices or teammates.
- Vision-based metrics are diagnostic heuristics, not medical measurements.
