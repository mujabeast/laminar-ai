# Laminar.AI

Laminar.AI is a study diagnostics web app that helps students with two problems:

1. staying focused during study sessions
2. understanding which academic concepts they are weak in

This repository is structured with the actual Next.js app inside the `webapp/` folder.

## Repository Structure

- `webapp/`: main Next.js application
- `webapp/extension/`: Chrome extension for tab tracking and confusion capture
- `testbench/`: judge-facing setup and run instructions

## Core Features

- Webcam-based attention tracking
- Browser-extension-based tab behavior tracking
- Confusion screenshot capture
- Attention dashboard with AI summaries and visuals
- Academic dashboard with merged weakness reports and AI analysis
- Local per-profile storage on each browser

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- OpenAI Responses API
- Chrome Extension (Manifest V3)

## Local Setup

1. Open a terminal in `webapp/`
2. Install dependencies:

```bash
npm install
```

3. Create a local env file:

```bash
cp .env.example .env.local
```

4. Add your OpenAI key to `.env.local`
5. Start the dev server:

```bash
npm run dev
```

6. Open:

`http://localhost:3000`

## Deployment Note

When deploying to Vercel, the project root directory must be set to:

`webapp`

## Judge / Testbench

Please see:

- `testbench/SETUP_AND_RUN.md`
- `testbench/env.example`

## Important Limitation

User data is currently stored in browser local storage, so each device/browser keeps its own copy of data.
