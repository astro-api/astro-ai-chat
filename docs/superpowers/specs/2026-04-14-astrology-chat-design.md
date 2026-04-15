# Astrology Chat — Design Spec

**Date:** 2026-04-14  
**Status:** Approved

---

## Overview

Локальное десктоп-приложение на Electron для астрологических консультаций через свободный диалог с ИИ. ИИ самостоятельно вызывает астрологическое API через инструменты (tool-use) и запоминает данные пользователя между сессиями.

---

## Tech Stack

| Слой | Технология |
|------|-----------|
| Десктоп-оболочка | Electron |
| UI | Vite + React + TypeScript |
| Компоненты | shadcn/ui + Tailwind CSS |
| AI streaming + tool-use | Vercel AI SDK |
| LLM провайдер | OpenRouter (модель выбирается в настройках) |
| Астрологическое API | `@astro-api/astroapi-typescript` |
| База данных | SQLite + better-sqlite3 + Drizzle ORM |

---

## Architecture

```
Renderer Process (Vite + React)
    ↕ IPC (contextBridge / ipcRenderer / ipcMain)
Main Process (Node.js / Electron)
    ├── Vercel AI SDK → OpenRouter → LLM (streaming)
    ├── AI Tools → @astro-api/astroapi-typescript → astrology-api.io
    ├── Memory Tool → SQLite (факты о пользователе)
    └── Chat History → SQLite
```

**Принцип:** renderer — только UI, никаких прямых вызовов внешних API. Всё через IPC в main process, где живут API-ключи и бизнес-логика. Streaming ответа передаётся из main в renderer через IPC-канал chunk за chunk.

---

## Database Schema

```sql
-- Список чатов
CREATE TABLE chats (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Сообщения
CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,  -- 'user' | 'assistant' | 'tool'
  content    TEXT NOT NULL,
  tool_calls TEXT,           -- JSON, опционально
  created_at INTEGER NOT NULL
);

-- Память ИИ (факты о пользователе)
CREATE TABLE memory (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Настройки приложения
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## AI Memory System

ИИ получает два memory-инструмента:

- **`save_memory(key, value)`** — сохранить факт (имя, дата рождения, место, предпочтения)
- **`get_memories()`** — получить все запомненные факты

В каждый запрос к LLM автоматически добавляется системный промпт с содержимым памяти:

```
You are an astrology consultant. You have access to astrology tools and remember the following facts about the user:
- name: Иван
- birth_date: 1990-05-15
- birth_time: 14:30
- birth_place: Moscow, Russia
...
```

Таким образом ИИ "знает" пользователя с первого сообщения в любом новом чате.

---

## AI Tools

Все инструменты описаны через Zod-схемы в `src/main/tools.ts`. ИИ вызывает их самостоятельно по контексту разговора.

### Память
| Tool | Описание |
|------|---------|
| `save_memory` | Запомнить факт о пользователе |
| `get_memories` | Получить все запомненные факты |

### Астрологическое API (`@astro-api/astroapi-typescript`)
| Tool | Описание |
|------|---------|
| `get_natal_chart` | Натальная карта (дата/время/место рождения) |
| `get_transits` | Текущие транзиты планет |
| `get_synastry` | Синастрия двух людей |
| `get_horoscope` | Гороскоп (знак, период) |
| `get_numerology` | Нумерологический анализ |
| `get_tarot_reading` | Расклад таро |
| `get_human_design` | Human Design |
| `get_vedic_chart` | Ведическая астрология |
| `get_chinese_astrology` | Китайская астрология |
| `get_arabic_parts` | Арабские части |
| `get_solar_return` | Солнечный возврат |
| `get_lunar_return` | Лунный возврат |

Дополнительные инструменты добавляются по мере необходимости на основе возможностей библиотеки.

---

## UI Structure

```
┌─────────────────────────────────────────┐
│  [Новый чат]                            │
│  ─────────────────────────────────────  │
│  > Натальная карта                      │
│    Синастрия с Машей                    │
│    Транзиты на апрель                   │
│                                         │
│  [Настройки]                            │
├──────────────────────────────────────── │
│  Что ты хочешь узнать?                  │
│                                         │
│  [AI]: Привет! Я вижу, что ты родился   │
│  15 мая 1990 года в Москве. Хочешь      │
│  посмотреть актуальные транзиты?        │
│                                         │
│  [Ты]: Да, покажи что сейчас влияет     │
│                                         │
│  [AI]: 🔄 Получаю транзиты...           │
│       Сейчас Сатурн в квадрате к        │
│       твоему Солнцу...                  │
│                                         │
│  ┌────────────────────────────────┐     │
│  │ Спроси об астрологии...    [→] │     │
│  └────────────────────────────────┘     │
└─────────────────────────────────────────┘
```

---

## File Structure

```
chat_astrology/
├── src/
│   ├── main/                    ← Electron main process
│   │   ├── index.ts             ← Точка входа Electron
│   │   ├── ipc.ts               ← IPC handlers (chat, memory, settings)
│   │   ├── ai.ts                ← Vercel AI SDK + streaming + tool orchestration
│   │   ├── tools.ts             ← Определения AI tools (Zod схемы + handlers)
│   │   ├── db/
│   │   │   ├── index.ts         ← Drizzle + better-sqlite3 connection
│   │   │   └── schema.ts        ← Drizzle schema
│   │   └── astro-client.ts      ← Обёртка над @astro-api/astroapi-typescript
│   └── renderer/                ← Vite + React
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── Sidebar.tsx      ← Список чатов
│       │   ├── Chat.tsx         ← Основной чат-контейнер
│       │   ├── MessageList.tsx  ← История сообщений
│       │   ├── Message.tsx      ← Одно сообщение (markdown rendering)
│       │   └── InputBar.tsx     ← Поле ввода
│       └── hooks/
│           └── useChat.ts       ← Хук для работы с IPC чата
├── electron.vite.config.ts      ← electron-vite конфиг
├── drizzle.config.ts
└── package.json
```

---

## IPC API

| Channel | Direction | Описание |
|---------|-----------|---------|
| `chat:send` | renderer → main | Отправить сообщение, получить stream |
| `chat:list` | renderer → main | Список всех чатов |
| `chat:get` | renderer → main | Сообщения конкретного чата |
| `chat:delete` | renderer → main | Удалить чат |
| `memory:list` | renderer → main | Все факты из памяти |
| `memory:delete` | renderer → main | Удалить факт |
| `settings:get` | renderer → main | Получить настройки |
| `settings:set` | renderer → main | Сохранить настройки |
| `chat:stream-chunk` | main → renderer | Chunk стримингового ответа |
| `chat:stream-end` | main → renderer | Конец стрима |

---

## Settings

В приложении есть экран настроек:
- **OPENROUTER_API_KEY** — ключ OpenRouter
- **ASTROLOGY_API_KEY** — ключ astrology-api.io
- **Model** — выбор LLM модели (текстовое поле, например `anthropic/claude-sonnet-4-5`)

Настройки хранятся в таблице `settings` SQLite (не в env файлах, т.к. десктоп-приложение).

---

## Error Handling

- Ошибки API (астро/LLM) возвращаются ИИ как текст в чате, пользователь видит понятное сообщение
- Если данных рождения нет в памяти, ИИ просит их в ходе разговора
- IPC ошибки передаются в renderer и отображаются как toast-уведомления

---

## Out of Scope (v1)

- Рендеринг SVG/PNG карт из API (только текстовые интерпретации)
- Мобильная версия
- Множество пользователей / авторизация
- Экспорт данных
