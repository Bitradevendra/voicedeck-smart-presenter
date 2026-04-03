# voicedeck-smart-presenter

`voicedeck-smart-presenter` is a Vite and React presentation tool that supports voice-driven slide control, subtitle generation, and PDF-based slide import.

## Overview

The application is built as a browser-based presenter assistant. It manages slides, listens for speech commands, switches between presentation states, and uses a Gemini integration for subtitle translation and wake-word suggestions.

## Project Structure

```text
voicedeck-smart-presenter/
|-- App.tsx
|-- components/
|-- services/
|-- types.ts
|-- package.json
|-- vite.config.ts
|-- index.html
`-- README.md
```

## Requirements

- Node.js 18+
- npm
- a `GEMINI_API_KEY` in `.env.local`

## Installation

```bash
npm install
copy .env.local.example .env.local
```

If there is no example file yet, create `.env.local` and add:

```env
GEMINI_API_KEY=your_api_key_here
```

## Running The Project

Development server:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## How It Works

- `App.tsx` manages slide state, voice recognition, PDF import, and subtitle flow
- `components/` contains the presentation and transition UI pieces
- `services/geminiService.ts` handles Gemini-powered translation and wake-word suggestions
- `types.ts` defines the application state and slide-related types
