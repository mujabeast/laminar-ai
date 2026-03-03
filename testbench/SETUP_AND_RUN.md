# Laminar.AI Testbench Setup And Run

This document explains how a judge or tester can run Laminar.AI.

## 1. Project Layout

The actual app is inside:

`webapp/`

## 2. Requirements

- Node.js 20+ recommended
- npm
- An OpenAI API key

## 3. Install App Dependencies

Open a terminal in:

`webapp/`

Run:

```bash
npm install
```

## 4. Environment Variables

Copy:

`testbench/env.example`

into:

`webapp/.env.local`

Then fill in:

- `OPENAI_API_KEY`

Recommended default model:

- `OPENAI_RESPONSES_MODEL=gpt-4.1-mini`

## 5. Run The Web App

In `webapp/`, run:

```bash
npm run dev
```

Then open:

`http://localhost:3000`

## 6. Basic Test Flow

1. Open Laminar.AI in the browser
2. Create or select a profile
3. Choose the distraction flow
4. Fill in a study plan
5. Start the webcam session
6. Open the attention dashboard
7. Generate the AI visual board / AI profile
8. Open Understanding Coach and enter a weak topic
9. Open the academic dashboard
10. Generate the AI overview / AI visual board

## 7. Alternative Academic Test Flow

1. Open Laminar.AI
2. Choose `I don't understand this topic`
3. Enter student name, topic, what is confusing, and optional uploads
4. Start the understanding session
5. Review the academic dashboard afterward

## 8. Important Product Limitation

This prototype uses browser local storage for user data.

That means:

- data is per browser/device
- profiles are local only
- data is not shared automatically across devices or teammates

## 9. Deployment Note

If deploying to Vercel:

- import the repository
- set Root Directory to `webapp`
- add the same environment variables in Vercel
