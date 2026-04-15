# AstroAI

A desktop AI chat app for astrology, numerology, tarot, Human Design, and related esoteric systems. Powered by large language models via multiple providers and the [Astrology API](https://astrology-api.io).

Built with Electron, React 19, TypeScript, and Tailwind CSS v4.

---

## Features

- AI chat with an astrology-focused system prompt
- 12 astrology tools: natal chart, transits, synastry, horoscope, numerology, tarot, Human Design, Vedic chart, Chinese astrology (BaZi), solar return, and more
- Multi-provider LLM support: OpenRouter, Anthropic, OpenAI, Google Gemini, Mistral
- Persistent chat history (SQLite)
- User memory — the AI remembers facts about you across sessions
- Multilingual UI: English, Russian, Spanish, German, French, Portuguese, Ukrainian, Turkish
- Inline chat rename, sidebar navigation
- Dark theme

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [npm](https://npmjs.com/) 9+

---

## API Keys

You will need at least one of the following:

| Provider | Where to get the key |
|---|---|
| **OpenRouter** (recommended) | [openrouter.ai/keys](https://openrouter.ai/keys) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/) |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Mistral | [console.mistral.ai](https://console.mistral.ai/) |
| **Astrology API** | [astrology-api.io](https://astrology-api.io) |

Enter keys in the app via **Settings** (gear icon in the sidebar).

---

## Development

```bash
# Install dependencies
npm install

# Start in development mode (hot reload)
npm run dev
```

> **Note:** After changing files in `src/main/`, electron-vite HMR does not always recompile the main process. If changes don't appear, run `npm run build` and restart.

---

## Building

### macOS

```bash
# Build universal .app (Intel + Apple Silicon)
npm run build:mac

# Build DMG installer
npm run build:mac:dmg
```

The built app will be in `dist/`.

**First launch on macOS:** Because the app uses an ad-hoc signature (no Apple Developer ID), macOS may block it. Run this command once after installing:

```bash
codesign --deep --force --sign - "/Applications/AstroAI.app" && xattr -dr com.apple.quarantine "/Applications/AstroAI.app"
```

Or step by step:
1. Sign the app: `codesign --deep --force --sign - "/Applications/AstroAI.app"`
2. Remove quarantine: `xattr -dr com.apple.quarantine "/Applications/AstroAI.app"`
3. Launch normally

### Windows

```bash
npm run build:win
```

### Linux

```bash
npm run build:linux
```

---

## Releasing a New Version

Releases are built automatically by GitHub Actions when a version tag is pushed. The workflow builds macOS (universal DMG), Windows (NSIS installer), and Linux (AppImage, deb, snap) in parallel and publishes them as a GitHub Release.

### Steps

**1. Bump the version**

```bash
npm version patch   # 1.0.0 → 1.0.1  (bug fix)
npm version minor   # 1.0.0 → 1.1.0  (new feature)
npm version major   # 1.0.0 → 2.0.0  (breaking change)
```

This updates `package.json` and creates a git commit automatically.

**2. Push the commit and tag**

```bash
git push origin master --tags
```

**3. Wait for CI**

GitHub Actions will run three build jobs (~10 min) and publish a Release at:
`https://github.com/<owner>/chat_astrology/releases`

### Pre-releases

For beta versions, use a tag with a `-` suffix — the release will be marked as pre-release automatically:

```bash
npm version prerelease --preid=beta   # → 1.0.1-beta.0
git push origin master --tags
```

---

## Project Structure

```
src/
  main/          — Electron main process (Node.js, SQLite, AI, IPC)
  preload/       — IPC bridge (contextBridge → window.electronAPI)
  renderer/      — React UI (browser context, no Node access)
    components/  — Chat, Sidebar, Settings, MessageList, InputBar, Message
    hooks/       — useChat (chat state + IPC event listeners)
    i18n/        — LanguageContext, translations, useLanguage
resources/
  icon.png       — App icon source (512×512)
  icon.icns      — macOS icon bundle
scripts/
  sign.sh        — Ad-hoc code signing for macOS builds
  gen-icon.mjs   — Icon generator (Sharp)
```

---

## Tech Stack

- **Electron** + **electron-vite** — desktop shell + build tooling
- **React 19** + **TypeScript** — UI
- **Tailwind CSS v4** — styling
- **shadcn/ui** + **Radix UI** — component primitives
- **Vercel AI SDK** (`ai`) — LLM streaming with tool calls
- **SQLite** via `better-sqlite3` + **Drizzle ORM** — local database
- **@astro-api/astroapi-typescript** — Astrology API client

---

## License

MIT
