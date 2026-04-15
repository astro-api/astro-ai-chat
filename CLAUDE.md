# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev            # Start Electron app with HMR (electron-vite)
npm run start          # Preview built app

# Type checking
npm run typecheck      # Run both node + web typechecks
npm run typecheck:node # Check main process (tsconfig.node.json)
npm run typecheck:web  # Check renderer (tsconfig.web.json)

# Code quality
npm run lint           # ESLint with cache
npm run format         # Prettier

# Building & packaging
npm run build          # typecheck + electron-vite build → out/
npm run build:mac      # macOS universal package
npm run build:mac:dmg  # macOS DMG installer
```

> **HMR caveat:** `electron-vite` HMR does not always recompile the main process. After changing `src/main/`, verify changes landed in `out/main/index.js` with grep before assuming they took effect.

## Architecture

This is an **Electron desktop app** (not a web app) with a strict main/renderer process split.

```
src/
  main/        → Electron main process (Node.js, SQLite, AI, IPC)
  preload/     → IPC bridge (contextBridge → window.electronAPI)
  renderer/    → React UI (browser context, no Node access)
```

### IPC Flow

1. Renderer calls `window.electronAPI.sendMessage(chatId, content)` — defined in `src/preload/index.ts`
2. Main catches `chat:send` in `src/main/index.ts` → delegates to `sendMessage()` in `src/main/ai.ts`
3. `ai.ts` streams via Vercel AI SDK `streamText()`, emitting `chat:stream-chunk` / `chat:stream-end` / `chat:stream-error` IPC events back to the renderer
4. Renderer's `useChat` hook listens for these events and updates React state

All IPC uses `ipcMain.handle()` (request/response) for CRUD operations and `webContents.send()` (push) for streaming events.

### AI & Tools

**Provider selection** is stored in the SQLite `settings` table. The default is OpenRouter (`anthropic/claude-sonnet-4-5`). Supported: OpenAI, Anthropic direct, Google Gemini, Mistral.

**12 astrology tools** are defined in `src/main/tools.ts` using Vercel AI SDK's `tool()` with Zod schemas. All tools call `@astro-api/astroapi-typescript`. Key constraints:
- Tools that accept birth location require both `birthPlace` (city string) and `countryCode` (ISO 3166-1 alpha-2, e.g. `"RU"`, `"US"`).
- The Tarot tool (`get_tarot_reading`) does **not** accept a `cards` field — the server draws cards itself.
- `streamText()` is called with `stopWhen: stepCountIs(10)` (max 10 tool-call rounds per response).

**User memory** (persistent facts like birth date, name) is stored in the `memory` table and injected into the system prompt at the start of each `sendMessage()` call.

### Database

SQLite file lives at `~/.config/astrology-chat/astrology-chat.db` (Electron `userData`). Schema and migrations are in `src/main/db/`. Drizzle ORM is used for all queries; migrations run automatically on startup.

Four tables: `chats`, `messages`, `memory`, `settings`.

### Renderer

React 19 with Tailwind CSS v4. Components are in `src/renderer/src/components/`. State is managed by the `useChat` hook (`src/renderer/src/hooks/useChat.ts`) — it owns all chat/message state and wires up IPC event listeners.

UI component library: shadcn/ui (New York style, Slate base color) with Radix UI primitives. Markdown in AI messages is rendered via `react-markdown`.

### Build Output

`electron-vite build` outputs to `out/`:
- `out/main/index.js` — main process bundle
- `out/preload/index.js` — preload bundle
- `out/renderer/` — renderer static assets

`electron-builder` then packages `out/` into a distributable.
