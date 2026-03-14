# PrepMate — AI Interview Prep Coach

An AI-powered interview preparation coach built on Cloudflare. Practice mock interviews, receive scored feedback, and improve your answers.

## What it does

- Asks role-specific interview questions (behavioral, technical, situational, culture-fit)
- Scores answers on a 1-10 scale with detailed feedback
- Remembers previous answers and tracks patterns across the session
- Provides overall performance summary on request
- Supports scheduling practice session reminders

## Architecture

- **LLM**: Workers AI via the Agents SDK
- **Workflow / Coordination**: Cloudflare Agents SDK on Durable Objects
- **User Input**: Real-time chat UI built with React, connected via WebSockets
- **Memory / State**: Durable Object persistent state

## Cloudflare Services Used

Workers AI, Durable Objects, Agents SDK, Workers

## How to run

Clone, npm install, npx wrangler login, npm run dev

## Tech Stack

TypeScript, React, Vite, Cloudflare Workers, Agents SDK, Vercel AI SDK
