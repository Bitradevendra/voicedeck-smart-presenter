# VoiceDeck Smart Presenter

A voice-first presentation assistant that turns a static slide deck into an interactive, speech-aware performance tool.

## Why It Stands Out

`voicedeck-smart-presenter` is built around a compelling idea: presentations should react to the speaker, not just the clicker. This app listens, switches slides with wake words, translates spoken subtitles, and even pulls slides out of PDFs.

## What It Does

- manages slide-based presentation state in the browser
- supports voice-triggered slide switching through wake words
- translates spoken subtitles using Gemini
- imports PDFs and converts pages into slides
- supports presentation mode and blank subtitle mode

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
- browser support for the Web Speech API

## Installation

```bash
npm install
```

Create `.env.local` if needed:

```env
GEMINI_API_KEY=your_api_key_here
```

## Run Locally

Development server:

```bash
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## How It Works

- `App.tsx` coordinates slide state, listening state, subtitle state, and PDF import.
- speech input is matched against wake words to jump between slides.
- Gemini-backed helpers translate subtitle text and suggest wake words.
- `components/` holds the rendering pieces for transitions and the presentation UI.

## Best Fit

This is a strong fit for presenters, demo builders, and hackathon teams who want the act of presenting to feel smarter and more theatrical.
