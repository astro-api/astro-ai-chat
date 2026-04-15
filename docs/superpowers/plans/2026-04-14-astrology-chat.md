# Astrology Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальное Electron-приложение для астрологических консультаций через свободный диалог с ИИ, использующее astrology API и сохраняющее память о пользователе.

**Architecture:** Electron main process содержит всю бизнес-логику (Vercel AI SDK, SQLite, вызовы API). Renderer (Vite + React) — только UI, общается с main через contextBridge IPC. Streaming ответов передаётся chunk-by-chunk через ipcMain.

**Tech Stack:** Electron + electron-vite + React + TypeScript + shadcn/ui + Tailwind CSS + Vercel AI SDK + @openrouter/ai-sdk-provider + @astro-api/astroapi-typescript + SQLite (better-sqlite3) + Drizzle ORM

---

## File Map

| Файл | Ответственность |
|------|----------------|
| `src/main/index.ts` | Точка входа Electron, создание окна |
| `src/preload/index.ts` | contextBridge — экспорт API в renderer |
| `src/main/ipc.ts` | Регистрация всех IPC handlers |
| `src/main/ai.ts` | Vercel AI SDK: streamText + tool orchestration |
| `src/main/tools.ts` | Определения AI tools (Zod схемы + execute) |
| `src/main/astro-client.ts` | Обёртка над @astro-api/astroapi-typescript |
| `src/main/db/schema.ts` | Drizzle schema (chats, messages, memory, settings) |
| `src/main/db/index.ts` | Drizzle + better-sqlite3 connection + migrations |
| `src/renderer/src/App.tsx` | Root layout: sidebar + chat area |
| `src/renderer/src/components/Sidebar.tsx` | Список чатов + новый чат |
| `src/renderer/src/components/Chat.tsx` | Контейнер активного чата |
| `src/renderer/src/components/MessageList.tsx` | Рендер истории сообщений |
| `src/renderer/src/components/Message.tsx` | Одно сообщение (markdown) |
| `src/renderer/src/components/InputBar.tsx` | Поле ввода + отправка |
| `src/renderer/src/components/Settings.tsx` | Настройки (ключи, модель) |
| `src/renderer/src/hooks/useChat.ts` | React hook для работы с IPC |

---

## Task 1: Инициализация проекта ✅ DONE

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/index.html`

Completed. electron-vite react-ts template, all deps installed, shadcn/ui manually configured, typecheck passes.

---

## Task 2: База данных — schema и connection

**Files:**
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Шаг 1: Написать Drizzle schema**

Создай `src/main/db/schema.ts`:

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  chatId: text('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'tool'] }).notNull(),
  content: text('content').notNull(),
  toolCalls: text('tool_calls'), // JSON string, nullable
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const memory = sqliteTable('memory', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
```

- [ ] **Шаг 2: Написать DB connection с авто-миграцией**

Создай `src/main/db/index.ts`:

```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { app } from 'electron'
import path from 'path'
import * as schema from './schema'

const dbPath = path.join(app.getPath('userData'), 'astrology-chat.db')
const sqlite = new Database(dbPath)

// Включить WAL mode для лучшей производительности
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

export function runMigrations(): void {
  migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') })
}
```

- [ ] **Шаг 3: Написать drizzle.config.ts**

Создай `drizzle.config.ts` в корне проекта:

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
} satisfies Config
```

- [ ] **Шаг 4: Сгенерировать миграции**

```bash
npx drizzle-kit generate
```

Ожидаемый результат: создана папка `drizzle/` с SQL-файлами миграций.

- [ ] **Шаг 5: Подключить миграции к запуску приложения**

В `src/main/index.ts` добавь вызов `runMigrations()` до создания окна:

```typescript
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { runMigrations } from './db'
import { registerIpcHandlers } from './ipc'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.serslon.astrology-chat')
  runMigrations()
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Шаг 6: Запустить и проверить что БД создаётся**

```bash
npm run dev
```

Ожидаемый результат: приложение запускается без ошибок. В `~/Library/Application Support/astrology-chat/` появится файл `astrology-chat.db`.

- [ ] **Шаг 7: Коммит**

```bash
git add src/main/db/ drizzle/ drizzle.config.ts src/main/index.ts
git commit -m "feat: add SQLite schema and Drizzle ORM with auto-migrations"
```

---

## Task 3: Astro Client — обёртка над @astro-api/astroapi-typescript

**Files:**
- Create: `src/main/astro-client.ts`

- [ ] **Шаг 1: Изучить экспорты библиотеки**

```bash
node -e "const lib = require('@astro-api/astroapi-typescript'); console.log(Object.keys(lib))"
```

- [ ] **Шаг 2: Создать инициализированный клиент**

Создай `src/main/astro-client.ts`:

```typescript
import { AstroApiClient } from '@astro-api/astroapi-typescript'
import { db } from './db'
import { settings } from './db/schema'
import { eq } from 'drizzle-orm'

let _client: AstroApiClient | null = null

export async function getAstroClient(): Promise<AstroApiClient> {
  if (_client) return _client

  const row = db.select().from(settings).where(eq(settings.key, 'ASTROLOGY_API_KEY')).get()
  const apiKey = row?.value

  if (!apiKey) {
    throw new Error('ASTROLOGY_API_KEY not configured. Please set it in Settings.')
  }

  _client = new AstroApiClient({ apiKey })
  return _client
}

// Сброс кэша при изменении ключа
export function resetAstroClient(): void {
  _client = null
}
```

- [ ] **Шаг 3: Коммит**

```bash
git add src/main/astro-client.ts
git commit -m "feat: add astro API client wrapper with lazy init"
```

---

## Task 4: AI Tools — определения инструментов для LLM

**Files:**
- Create: `src/main/tools.ts`

- [ ] **Шаг 1: Создать файл с определениями всех tools**

Создай `src/main/tools.ts`:

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { db } from './db'
import { memory } from './db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { getAstroClient } from './astro-client'

// ── Memory tools ──────────────────────────────────────────────

export const saveMemoryTool = tool({
  description:
    'Save a fact about the user to persistent memory. Use this when the user mentions important personal information: name, birth date, birth time, birth place, relationship status, preferences, or any fact useful for future astrology readings.',
  parameters: z.object({
    key: z
      .string()
      .describe(
        'Short key for the fact, e.g. "birth_date", "birth_place", "name", "partner_birth_date"',
      ),
    value: z.string().describe('The value to remember, e.g. "1990-05-15", "Moscow, Russia"'),
  }),
  execute: async ({ key, value }) => {
    const now = new Date()
    db.insert(memory)
      .values({ id: randomUUID(), key, value, updatedAt: now })
      .onConflictDoUpdate({ target: memory.key, set: { value, updatedAt: now } })
      .run()
    return { success: true, saved: { key, value } }
  },
})

export const getMemoriesTool = tool({
  description:
    'Retrieve all facts remembered about the user. Call this if you need to recall stored information like birth data.',
  parameters: z.object({}),
  execute: async () => {
    const rows = db.select().from(memory).all()
    return { memories: rows.map((r) => ({ key: r.key, value: r.value })) }
  },
})

// ── Astrology tools ───────────────────────────────────────────

export const getNatalChartTool = tool({
  description:
    'Get the natal (birth) chart for a person. Requires date, time, and place of birth. Returns planetary positions, houses, and aspects.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h), e.g. "14:30"'),
    birthPlace: z.string().describe('City and country, e.g. "Moscow, Russia"'),
    lat: z.number().optional().describe('Latitude (if known)'),
    lon: z.number().optional().describe('Longitude (if known)'),
  }),
  execute: async (params) => {
    const client = await getAstroClient()
    try {
      const result = await client.getNatalChart({
        date: params.birthDate,
        time: params.birthTime,
        location: params.birthPlace,
        ...(params.lat !== undefined && { lat: params.lat }),
        ...(params.lon !== undefined && { lon: params.lon }),
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getTransitsTool = tool({
  description:
    'Get current planetary transits and their influence on a natal chart. Use to answer questions about what is happening astrologically right now.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format'),
    birthPlace: z.string().describe('City and country'),
    transitDate: z
      .string()
      .optional()
      .describe('Date to check transits for in YYYY-MM-DD format, defaults to today'),
  }),
  execute: async (params) => {
    const client = await getAstroClient()
    try {
      const result = await client.getTransits({
        date: params.birthDate,
        time: params.birthTime,
        location: params.birthPlace,
        transitDate: params.transitDate ?? new Date().toISOString().split('T')[0],
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getSynastryTool = tool({
  description:
    'Calculate synastry (compatibility) between two people. Returns aspects between their natal charts.',
  parameters: z.object({
    person1: z.object({
      birthDate: z.string().describe('YYYY-MM-DD'),
      birthTime: z.string().describe('HH:MM'),
      birthPlace: z.string(),
    }),
    person2: z.object({
      birthDate: z.string().describe('YYYY-MM-DD'),
      birthTime: z.string().describe('HH:MM'),
      birthPlace: z.string(),
    }),
  }),
  execute: async ({ person1, person2 }) => {
    const client = await getAstroClient()
    try {
      const result = await client.getSynastry({
        person1: { date: person1.birthDate, time: person1.birthTime, location: person1.birthPlace },
        person2: { date: person2.birthDate, time: person2.birthTime, location: person2.birthPlace },
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getHoroscopeTool = tool({
  description: 'Get horoscope for a zodiac sign for a given period.',
  parameters: z.object({
    sign: z
      .enum([
        'aries',
        'taurus',
        'gemini',
        'cancer',
        'leo',
        'virgo',
        'libra',
        'scorpio',
        'sagittarius',
        'capricorn',
        'aquarius',
        'pisces',
      ])
      .describe('Zodiac sign'),
    period: z
      .enum(['daily', 'weekly', 'monthly', 'yearly'])
      .describe('Horoscope period')
      .default('daily'),
  }),
  execute: async ({ sign, period }) => {
    const client = await getAstroClient()
    try {
      const result = await client.getHoroscope({ sign, period })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getNumerologyTool = tool({
  description: 'Calculate numerology for a person based on their name and birth date.',
  parameters: z.object({
    name: z.string().describe('Full name'),
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
  }),
  execute: async ({ name, birthDate }) => {
    const client = await getAstroClient()
    try {
      const result = await client.getNumerology({ name, date: birthDate })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getTarotReadingTool = tool({
  description: 'Get a tarot card reading. Can be a single card, three cards, or Celtic cross.',
  parameters: z.object({
    spread: z
      .enum(['single', 'three-card', 'celtic-cross'])
      .describe('Type of tarot spread')
      .default('three-card'),
    question: z.string().optional().describe('Optional question for the reading'),
  }),
  execute: async ({ spread, question }) => {
    const client = await getAstroClient()
    try {
      const result = await client.getTarotReading({ spread, question })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getHumanDesignTool = tool({
  description: 'Get Human Design chart for a person.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format'),
    birthPlace: z.string().describe('City and country'),
  }),
  execute: async ({ birthDate, birthTime, birthPlace }) => {
    const client = await getAstroClient()
    try {
      const result = await client.getHumanDesign({
        date: birthDate,
        time: birthTime,
        location: birthPlace,
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getVedicChartTool = tool({
  description: 'Get Vedic (Jyotish) astrology chart.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format'),
    birthPlace: z.string().describe('City and country'),
  }),
  execute: async ({ birthDate, birthTime, birthPlace }) => {
    const client = await getAstroClient()
    try {
      const result = await client.getVedicChart({
        date: birthDate,
        time: birthTime,
        location: birthPlace,
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getChineseAstrologyTool = tool({
  description: 'Get Chinese astrology information for a person.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
  }),
  execute: async ({ birthDate }) => {
    const client = await getAstroClient()
    try {
      const result = await client.getChineseAstrology({ date: birthDate })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getSolarReturnTool = tool({
  description: 'Get solar return chart for the upcoming or specified birthday year.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format'),
    birthPlace: z.string().describe('City and country'),
    year: z.number().optional().describe('Year for solar return, defaults to current year'),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, year }) => {
    const client = await getAstroClient()
    try {
      const result = await client.getSolarReturn({
        date: birthDate,
        time: birthTime,
        location: birthPlace,
        year: year ?? new Date().getFullYear(),
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

// Экспорт всех tools в формате для Vercel AI SDK
export const allTools = {
  save_memory: saveMemoryTool,
  get_memories: getMemoriesTool,
  get_natal_chart: getNatalChartTool,
  get_transits: getTransitsTool,
  get_synastry: getSynastryTool,
  get_horoscope: getHoroscopeTool,
  get_numerology: getNumerologyTool,
  get_tarot_reading: getTarotReadingTool,
  get_human_design: getHumanDesignTool,
  get_vedic_chart: getVedicChartTool,
  get_chinese_astrology: getChineseAstrologyTool,
  get_solar_return: getSolarReturnTool,
}
```

- [ ] **Шаг 2: Коммит**

```bash
git add src/main/tools.ts
git commit -m "feat: add AI tools definitions for memory and astrology API"
```

---

## Task 5: AI Engine — streamText + IPC streaming

**Files:**
- Create: `src/main/ai.ts`

- [ ] **Шаг 1: Создать AI engine**

Создай `src/main/ai.ts`:

```typescript
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { streamText, isStepCount } from 'ai'
import { BrowserWindow } from 'electron'
import { db } from './db'
import { messages, memory, settings, chats } from './db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { allTools } from './tools'

function getOpenRouterClient() {
  const keyRow = db.select().from(settings).where(eq(settings.key, 'OPENROUTER_API_KEY')).get()
  if (!keyRow?.value) throw new Error('OPENROUTER_API_KEY not configured')
  return createOpenRouter({ apiKey: keyRow.value })
}

function getModel() {
  const modelRow = db.select().from(settings).where(eq(settings.key, 'model')).get()
  return modelRow?.value ?? 'anthropic/claude-sonnet-4-5'
}

function buildSystemPrompt(): string {
  const memories = db.select().from(memory).all()
  const memorySection =
    memories.length > 0
      ? '\n\nKnown facts about the user:\n' + memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')
      : ''

  return `You are a knowledgeable and empathetic astrology consultant. You help users explore astrology, numerology, tarot, Human Design, and related esoteric systems.

You have access to a suite of astrology tools — use them proactively when relevant. For example:
- If the user mentions their birth date and asks about their personality, call get_natal_chart
- If they ask about current influences, call get_transits  
- If they ask about compatibility, call get_synastry
- If they share important personal info (name, birth data, etc.), call save_memory immediately

Always interpret API results in a warm, insightful way. Translate technical astrological data into meaningful insights.${memorySection}

Today's date: ${new Date().toISOString().split('T')[0]}`
}

export interface SendMessageParams {
  chatId: string
  userMessage: string
  window: BrowserWindow
}

export async function sendMessage({ chatId, userMessage, window }: SendMessageParams): Promise<void> {
  // Сохранить сообщение пользователя
  db.insert(messages)
    .values({
      id: randomUUID(),
      chatId,
      role: 'user',
      content: userMessage,
      createdAt: new Date(),
    })
    .run()

  // Загрузить историю чата
  const history = db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(messages.createdAt)
    .all()

  const openrouter = getOpenRouterClient()
  const modelId = getModel()

  const result = streamText({
    model: openrouter(modelId),
    system: buildSystemPrompt(),
    messages: history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    tools: allTools,
    maxSteps: 10,
    stopWhen: isStepCount(10),
  })

  let fullText = ''

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      fullText += chunk.textDelta
      window.webContents.send('chat:stream-chunk', { chatId, chunk: chunk.textDelta })
    }
  }

  // Сохранить финальный ответ ассистента
  db.insert(messages)
    .values({
      id: randomUUID(),
      chatId,
      role: 'assistant',
      content: fullText,
      createdAt: new Date(),
    })
    .run()

  // Обновить время последнего сообщения в чате
  db.update(chats)
    .set({ updatedAt: new Date() })
    .where(eq(chats.id, chatId))
    .run()

  // Авто-генерация заголовка по первому сообщению
  const chatRow = db.select().from(chats).where(eq(chats.id, chatId)).get()
  if (chatRow?.title === 'New Chat') {
    const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '')
    db.update(chats).set({ title }).where(eq(chats.id, chatId)).run()
  }

  window.webContents.send('chat:stream-end', { chatId })
}
```

- [ ] **Шаг 2: Коммит**

```bash
git add src/main/ai.ts
git commit -m "feat: add AI engine with streaming and tool orchestration"
```

---

## Task 6: IPC Handlers

**Files:**
- Create: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Шаг 1: Создать IPC handlers**

Создай `src/main/ipc.ts`:

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { db } from './db'
import { chats, messages, memory, settings } from './db/schema'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { sendMessage } from './ai'
import { resetAstroClient } from './astro-client'

export function registerIpcHandlers(): void {
  // ── Chats ────────────────────────────────────────────────────

  ipcMain.handle('chat:create', () => {
    const id = randomUUID()
    const now = new Date()
    db.insert(chats).values({ id, title: 'New Chat', createdAt: now, updatedAt: now }).run()
    return { id, title: 'New Chat', createdAt: now, updatedAt: now }
  })

  ipcMain.handle('chat:list', () => {
    return db.select().from(chats).orderBy(desc(chats.updatedAt)).all()
  })

  ipcMain.handle('chat:get', (_event, chatId: string) => {
    return db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.createdAt).all()
  })

  ipcMain.handle('chat:delete', (_event, chatId: string) => {
    db.delete(chats).where(eq(chats.id, chatId)).run()
    return { success: true }
  })

  // ── Messages / streaming ─────────────────────────────────────

  ipcMain.handle('chat:send', async (event, { chatId, message }: { chatId: string; message: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)!
    try {
      await sendMessage({ chatId, userMessage: message, window })
      return { success: true }
    } catch (err) {
      window.webContents.send('chat:stream-error', { chatId, error: String(err) })
      return { success: false, error: String(err) }
    }
  })

  // ── Memory ───────────────────────────────────────────────────

  ipcMain.handle('memory:list', () => {
    return db.select().from(memory).all()
  })

  ipcMain.handle('memory:delete', (_event, key: string) => {
    db.delete(memory).where(eq(memory.key, key)).run()
    return { success: true }
  })

  // ── Settings ─────────────────────────────────────────────────

  ipcMain.handle('settings:get', () => {
    const rows = db.select().from(settings).all()
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  })

  ipcMain.handle('settings:set', (_event, updates: Record<string, string>) => {
    for (const [key, value] of Object.entries(updates)) {
      db.insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
        .run()
    }
    resetAstroClient()
    return { success: true }
  })
}
```

- [ ] **Шаг 2: Обновить preload script**

Перезапиши `src/preload/index.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

export type ChatRecord = {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export type MessageRecord = {
  id: string
  chatId: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls: string | null
  createdAt: Date
}

export type MemoryRecord = {
  id: string
  key: string
  value: string
  updatedAt: Date
}

const api = {
  // Chats
  createChat: () => ipcRenderer.invoke('chat:create') as Promise<ChatRecord>,
  listChats: () => ipcRenderer.invoke('chat:list') as Promise<ChatRecord[]>,
  getChat: (chatId: string) => ipcRenderer.invoke('chat:get', chatId) as Promise<MessageRecord[]>,
  deleteChat: (chatId: string) => ipcRenderer.invoke('chat:delete', chatId) as Promise<{ success: boolean }>,

  // Messaging
  sendMessage: (chatId: string, message: string) =>
    ipcRenderer.invoke('chat:send', { chatId, message }) as Promise<{ success: boolean }>,

  // Stream events
  onStreamChunk: (cb: (data: { chatId: string; chunk: string }) => void) => {
    ipcRenderer.on('chat:stream-chunk', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('chat:stream-chunk')
  },
  onStreamEnd: (cb: (data: { chatId: string }) => void) => {
    ipcRenderer.on('chat:stream-end', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('chat:stream-end')
  },
  onStreamError: (cb: (data: { chatId: string; error: string }) => void) => {
    ipcRenderer.on('chat:stream-error', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('chat:stream-error')
  },

  // Memory
  listMemory: () => ipcRenderer.invoke('memory:list') as Promise<MemoryRecord[]>,
  deleteMemory: (key: string) => ipcRenderer.invoke('memory:delete', key) as Promise<{ success: boolean }>,

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Record<string, string>>,
  setSettings: (updates: Record<string, string>) =>
    ipcRenderer.invoke('settings:set', updates) as Promise<{ success: boolean }>,
}

contextBridge.exposeInMainWorld('electronAPI', api)

declare global {
  interface Window {
    electronAPI: typeof api
  }
}
```

- [ ] **Шаг 3: Коммит**

```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat: add IPC handlers and contextBridge preload API"
```

---

## Task 7: React hook useChat

**Files:**
- Create: `src/renderer/src/hooks/useChat.ts`

- [ ] **Шаг 1: Создать hook**

Создай `src/renderer/src/hooks/useChat.ts`:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type Chat = {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export function useChat() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const streamingContentRef = useRef('')

  const loadChats = useCallback(async () => {
    const list = await window.electronAPI.listChats()
    setChats(list as Chat[])
  }, [])

  const loadMessages = useCallback(async (chatId: string) => {
    const msgs = await window.electronAPI.getChat(chatId)
    setMessages(
      msgs.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    )
  }, [])

  useEffect(() => {
    const unsubChunk = window.electronAPI.onStreamChunk(({ chunk }) => {
      streamingContentRef.current += chunk
      setStreamingContent(streamingContentRef.current)
    })

    const unsubEnd = window.electronAPI.onStreamEnd(async ({ chatId }) => {
      setIsStreaming(false)
      streamingContentRef.current = ''
      setStreamingContent('')
      await loadMessages(chatId)
      await loadChats()
    })

    const unsubError = window.electronAPI.onStreamError(({ error }) => {
      setIsStreaming(false)
      streamingContentRef.current = ''
      setStreamingContent('')
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${error}` },
      ])
    })

    return () => {
      unsubChunk()
      unsubEnd()
      unsubError()
    }
  }, [loadMessages, loadChats])

  const createChat = useCallback(async () => {
    const chat = await window.electronAPI.createChat()
    await loadChats()
    setActiveChatId(chat.id)
    setMessages([])
    return chat
  }, [loadChats])

  const selectChat = useCallback(
    async (chatId: string) => {
      setActiveChatId(chatId)
      await loadMessages(chatId)
    },
    [loadMessages],
  )

  const deleteChat = useCallback(
    async (chatId: string) => {
      await window.electronAPI.deleteChat(chatId)
      await loadChats()
      if (activeChatId === chatId) {
        setActiveChatId(null)
        setMessages([])
      }
    },
    [activeChatId, loadChats],
  )

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeChatId || isStreaming) return

      const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      streamingContentRef.current = ''
      setStreamingContent('')

      await window.electronAPI.sendMessage(activeChatId, content)
    },
    [activeChatId, isStreaming],
  )

  useEffect(() => {
    loadChats()
  }, [loadChats])

  return {
    chats,
    activeChatId,
    messages,
    isStreaming,
    streamingContent,
    createChat,
    selectChat,
    deleteChat,
    sendMessage,
  }
}
```

- [ ] **Шаг 2: Коммит**

```bash
git add src/renderer/src/hooks/useChat.ts
git commit -m "feat: add useChat hook for IPC-based chat state management"
```

---

## Task 8: UI компоненты

**Files:**
- Create: `src/renderer/src/components/Sidebar.tsx`
- Create: `src/renderer/src/components/InputBar.tsx`
- Create: `src/renderer/src/components/Message.tsx`
- Create: `src/renderer/src/components/MessageList.tsx`
- Create: `src/renderer/src/components/Chat.tsx`
- Create: `src/renderer/src/components/Settings.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Шаг 1: Создать Sidebar**

Создай `src/renderer/src/components/Sidebar.tsx`:

```tsx
import { Plus, Trash2, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

type Chat = { id: string; title: string }

interface SidebarProps {
  chats: Chat[]
  activeChatId: string | null
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onOpenSettings: () => void
}

export function Sidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onOpenSettings,
}: SidebarProps) {
  return (
    <div className="flex flex-col w-64 h-full bg-slate-900 border-r border-slate-700">
      <div className="p-3">
        <Button onClick={onNewChat} className="w-full" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>

      <Separator className="bg-slate-700" />

      <ScrollArea className="flex-1 px-2 py-2">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`group flex items-center justify-between rounded-md px-3 py-2 mb-1 cursor-pointer text-sm transition-colors ${
              activeChatId === chat.id
                ? 'bg-slate-700 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
            onClick={() => onSelectChat(chat.id)}
          >
            <span className="truncate flex-1">{chat.title}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation()
                onDeleteChat(chat.id)
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </ScrollArea>

      <Separator className="bg-slate-700" />
      <div className="p-3">
        <Button
          onClick={onOpenSettings}
          variant="ghost"
          className="w-full text-slate-400 hover:text-white"
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Шаг 2: Создать Message**

Создай `src/renderer/src/components/Message.tsx`:

```tsx
import ReactMarkdown from 'react-markdown'

interface MessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function Message({ role, content, isStreaming }: MessageProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-slate-800 text-slate-100 border border-slate-700'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && <span className="animate-pulse">▋</span>}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Шаг 3: Создать MessageList**

Создай `src/renderer/src/components/MessageList.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Message } from './Message'

type MessageData = { id: string; role: 'user' | 'assistant'; content: string }

interface MessageListProps {
  messages: MessageData[]
  streamingContent: string
  isStreaming: boolean
}

export function MessageList({ messages, streamingContent, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <ScrollArea className="flex-1 px-4 py-4">
      {messages.map((msg) => (
        <Message key={msg.id} role={msg.role} content={msg.content} />
      ))}
      {isStreaming && (
        <Message role="assistant" content={streamingContent} isStreaming={true} />
      )}
      <div ref={bottomRef} />
    </ScrollArea>
  )
}
```

- [ ] **Шаг 4: Создать InputBar**

Создай `src/renderer/src/components/InputBar.tsx`:

```tsx
import { useState, KeyboardEvent } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { SendHorizontal } from 'lucide-react'

interface InputBarProps {
  onSend: (message: string) => void
  disabled: boolean
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [value, setValue] = useState('')

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex items-end gap-2 p-4 border-t border-slate-700 bg-slate-900">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about astrology... (Enter to send, Shift+Enter for new line)"
        className="flex-1 min-h-[48px] max-h-[200px] resize-none bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
        disabled={disabled}
        rows={1}
      />
      <Button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        size="icon"
        className="h-12 w-12 bg-indigo-600 hover:bg-indigo-500"
      >
        <SendHorizontal className="h-5 w-5" />
      </Button>
    </div>
  )
}
```

- [ ] **Шаг 5: Создать Chat**

Создай `src/renderer/src/components/Chat.tsx`:

```tsx
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'

type Message = { id: string; role: 'user' | 'assistant'; content: string }

interface ChatProps {
  messages: Message[]
  streamingContent: string
  isStreaming: boolean
  onSend: (message: string) => void
  hasActiveChat: boolean
}

export function Chat({ messages, streamingContent, isStreaming, onSend, hasActiveChat }: ChatProps) {
  if (!hasActiveChat) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-slate-950 text-slate-500">
        <p className="text-lg">Select a chat or create a new one</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 bg-slate-950 overflow-hidden">
      <MessageList messages={messages} streamingContent={streamingContent} isStreaming={isStreaming} />
      <InputBar onSend={onSend} disabled={isStreaming} />
    </div>
  )
}
```

- [ ] **Шаг 6: Создать Settings**

Создай `src/renderer/src/components/Settings.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'

interface SettingsProps {
  onClose: () => void
}

export function Settings({ onClose }: SettingsProps) {
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [astrologyKey, setAstrologyKey] = useState('')
  const [model, setModel] = useState('anthropic/claude-sonnet-4-5')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      setOpenrouterKey(s['OPENROUTER_API_KEY'] ?? '')
      setAstrologyKey(s['ASTROLOGY_API_KEY'] ?? '')
      setModel(s['model'] ?? 'anthropic/claude-sonnet-4-5')
    })
  }, [])

  const handleSave = async () => {
    await window.electronAPI.setSettings({
      OPENROUTER_API_KEY: openrouterKey,
      ASTROLOGY_API_KEY: astrologyKey,
      model,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-[480px] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-semibold">Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-slate-300 text-sm mb-1 block">OpenRouter API Key</label>
            <Input
              type="password"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              placeholder="sk-or-..."
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div>
            <label className="text-slate-300 text-sm mb-1 block">Astrology API Key</label>
            <Input
              type="password"
              value={astrologyKey}
              onChange={(e) => setAstrologyKey(e.target.value)}
              placeholder="your-astrology-api-key"
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div>
            <label className="text-slate-300 text-sm mb-1 block">Model</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="anthropic/claude-sonnet-4-5"
              className="bg-slate-800 border-slate-600 text-white"
            />
            <p className="text-slate-500 text-xs mt-1">
              Any model available on OpenRouter, e.g. openai/gpt-4o
            </p>
          </div>
        </div>

        <Button
          onClick={handleSave}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Шаг 7: Обновить App.tsx**

Перезапиши `src/renderer/src/App.tsx`:

```tsx
import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Chat } from './components/Chat'
import { Settings } from './components/Settings'
import { useChat } from './hooks/useChat'

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  const {
    chats,
    activeChatId,
    messages,
    isStreaming,
    streamingContent,
    createChat,
    selectChat,
    deleteChat,
    sendMessage,
  } = useChat()

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onNewChat={createChat}
        onSelectChat={selectChat}
        onDeleteChat={deleteChat}
        onOpenSettings={() => setShowSettings(true)}
      />

      <Chat
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        onSend={sendMessage}
        hasActiveChat={activeChatId !== null}
      />

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}
```

- [ ] **Шаг 8: Коммит**

```bash
git add src/renderer/src/
git commit -m "feat: add full chat UI with sidebar, message list, input bar, and settings"
```

---

## Task 9: Финальная проверка и полировка

**Files:**
- Modify: `src/main/index.ts`
- Modify: `package.json`

- [ ] **Шаг 1: Настроить package.json**

В `package.json` обнови поля:

```json
{
  "name": "astrology-chat",
  "productName": "Astrology Chat",
  "version": "1.0.0",
  "description": "Local astrology chat powered by AI"
}
```

- [ ] **Шаг 2: Настроить окно приложения**

В `src/main/index.ts` обнови `BrowserWindow`:

```typescript
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  title: 'Astrology Chat',
  backgroundColor: '#020817',
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
  },
})
```

- [ ] **Шаг 3: Проверить полный флоу**

1. Запусти `npm run dev`
2. Открой Settings, введи OPENROUTER_API_KEY, ASTROLOGY_API_KEY, Model
3. Создай новый чат
4. Напиши тестовое сообщение
5. Убедись что streaming работает

- [ ] **Шаг 4: Финальный коммит**

```bash
git add -A
git commit -m "feat: finalize app configuration and window settings"
```
