# Остановка генерации и редактирование сообщения — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить кнопку остановки генерации ответа AI и возможность отредактировать последнее своё сообщение после остановки, с перезапросом.

**Architecture:** Прерывание реализуется через `AbortController`, передаваемый в `streamText({ abortSignal })`; контроллеры хранятся в модульном `Map<chatId, AbortController>` в `ai.ts`. Прерванный ответ сохраняется в БД с булевым флагом `interrupted`. Редактирование идёт через отдельный IPC `chat:edit-last`, который удаляет прерванный ответ + последнее юзер-сообщение и перезапускает `sendMessage()`. UI: кнопка отправки переключается на анимированный «стоп» во время стрима; у последнего своего сообщения появляется карандаш для правки.

**Tech Stack:** Electron, Vercel AI SDK (`ai` — `streamText`), Drizzle ORM + better-sqlite3, React 19, lucide-react, vitest (добавляется в Task 1).

## Global Constraints

- Язык интерфейсных строк добавляется во ВСЕ 8 локалей (`en, ru, es, de, fr, pt, uk, tr`) в `src/renderer/src/i18n/translations.ts`. Тип `Translations` обновляется первым.
- Миграции БД генерируются ТОЛЬКО через `npx drizzle-kit generate` (конфиг `drizzle.config.ts`, выход в `drizzle/`). Никогда не писать SQL/`ALTER TABLE` вручную — это рассинхронизирует `drizzle/meta/_journal.json`.
- `AbortError` (`err?.name === 'AbortError'`) — это штатная остановка, НЕ ошибка: не прогонять через `friendlyError`, не дописывать `⚠️`.
- Renderer не имеет доступа к Node — весь доступ к БД/AI только через IPC (`window.electronAPI`).
- После изменений в `src/main/` проверять, что они попали в `out/main/index.js` (HMR electron-vite не всегда перекомпилирует main).
- Стиль кода: инлайн-стили в стиле существующих компонентов (тёмная палитра `#111111`/`#1a1a1a`/`#2a2a2a`/`#585B65`/`#e8e8e8`).

---

### Task 1: Подключить vitest для тестирования main-логики

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (devDependencies + scripts)

**Interfaces:**
- Produces: npm-скрипт `test` (`vitest run`) и `test:watch` (`vitest`); окружение `node`.

- [ ] **Step 1: Установить vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Создать конфиг vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Добавить скрипты в package.json**

В секцию `"scripts"` добавить:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Smoke-тест, что раннер работает**

Create `src/main/__smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test`
Expected: PASS (1 passed). После проверки удалить файл `src/main/__smoke.test.ts`.

- [ ] **Step 5: Commit**

```bash
rm src/main/__smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest runner for main-process logic"
```

---

### Task 2: Добавить колонку `interrupted` в схему и сгенерировать миграцию

**Files:**
- Modify: `src/main/db/schema.ts:12-21` (таблица `messages`)
- Create: `drizzle/0002_*.sql` (генерируется автоматически)
- Modify: `drizzle/meta/_journal.json` (генерируется автоматически)

**Interfaces:**
- Produces: поле `messages.interrupted: boolean | null` в Drizzle-схеме и БД.

- [ ] **Step 1: Добавить колонку в схему**

В `src/main/db/schema.ts` в определении `messages`, после строки `toolCalls: text('tool_calls'),` добавить:

```typescript
  interrupted: integer('interrupted', { mode: 'boolean' }),
```

(`integer` уже импортирован в начале файла.)

- [ ] **Step 2: Сгенерировать миграцию**

Run: `npx drizzle-kit generate`
Expected: создан новый файл `drizzle/0002_*.sql` с `ALTER TABLE messages ADD ...` и обновлён `drizzle/meta/_journal.json`.

- [ ] **Step 3: Проверить содержимое миграции**

Run: `cat drizzle/0002_*.sql`
Expected: одна строка вида `ALTER TABLE \`messages\` ADD \`interrupted\` integer;`

- [ ] **Step 4: Проверить, что typecheck проходит**

Run: `npm run typecheck:node`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/schema.ts drizzle/
git commit -m "feat(db): add interrupted column to messages"
```

---

### Task 3: Реестр AbortController и функция abortStream (main)

**Files:**
- Modify: `src/main/ai.ts` (добавить Map, экспорт `abortStream`, прокинуть `abortSignal`)
- Test: `src/main/ai.abort.test.ts`

**Interfaces:**
- Produces:
  - `export function abortStream(chatId: string): void` — вызывает `.abort()` у контроллера в Map, если он есть; иначе no-op.
  - Внутренний `activeStreams: Map<string, AbortController>`.
  - Экспорт `activeStreams` для теста (или тест через `abortStream` + ручное добавление — см. ниже).

- [ ] **Step 1: Написать падающий тест на abortStream**

Create `src/main/ai.abort.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// db/index.ts тянет electron на верхнем уровне — мокаем модуль целиком,
// чтобы тестировать только реестр контроллеров.
vi.mock('./db', () => ({ db: {} }))
vi.mock('electron', () => ({ BrowserWindow: {} }))

import { activeStreams, abortStream } from './ai'

describe('abortStream', () => {
  it('aborts the controller registered for a chat', () => {
    const controller = new AbortController()
    activeStreams.set('chat-1', controller)

    abortStream('chat-1')

    expect(controller.signal.aborted).toBe(true)
  })

  it('is a no-op when no controller is registered', () => {
    expect(() => abortStream('missing-chat')).not.toThrow()
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run src/main/ai.abort.test.ts`
Expected: FAIL — `activeStreams`/`abortStream` не экспортируются.

- [ ] **Step 3: Реализовать реестр и abortStream**

В `src/main/ai.ts` после импортов добавить:

```typescript
export const activeStreams = new Map<string, AbortController>()

export function abortStream(chatId: string): void {
  activeStreams.get(chatId)?.abort()
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run src/main/ai.abort.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Прокинуть AbortController в sendMessage**

В `src/main/ai.ts`, в функции `sendMessage`, ДО `try {` блока со `streamText` (около строки 89, рядом с `let fullText = ''`) добавить:

```typescript
  const controller = new AbortController()
  activeStreams.set(chatId, controller)
```

В вызов `streamText({ ... })` (строки 92-98) добавить поле:

```typescript
      abortSignal: controller.signal,
```

В самом конце `sendMessage`, обернуть финальную логику так, чтобы контроллер всегда удалялся. Конкретно: после внешнего `catch (err: any) { ... }` блока (заканчивается на строке ~121) добавить `finally`:

```typescript
  } finally {
    activeStreams.delete(chatId)
  }
```

ВАЖНО: `finally` относится к тому же `try`, что и `catch (err: any)` (внешний try-catch вокруг стрима, строки 91-121). Убедиться, что `db.insert` сохранения ответа, `db.update` и `window.webContents.send('chat:stream-end', ...)` (строки 123-136) остаются ПОСЛЕ `finally` — они должны выполниться в любом случае.

- [ ] **Step 6: Проверить typecheck**

Run: `npm run typecheck:node`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add src/main/ai.ts src/main/ai.abort.test.ts
git commit -m "feat(ai): add AbortController registry and abortStream"
```

---

### Task 4: Обработка AbortError и сохранение прерванного ответа (main)

**Files:**
- Modify: `src/main/ai.ts` (ветка catch для AbortError + флаг interrupted при сохранении)

**Interfaces:**
- Consumes: `activeStreams`, `controller.signal` из Task 3.
- Produces: при остановке непустой `fullText` сохраняется с `interrupted: true`; пустой — не сохраняется; `⚠️` не добавляется.

- [ ] **Step 1: Добавить флаг прерывания и обработку AbortError**

В `src/main/ai.ts` рядом с `let fullText = ''` добавить:

```typescript
  let wasAborted = false
```

В цикле `for await` ветка `chunk.type === 'error'` остаётся как есть. Изменить ВНЕШНИЙ `catch (err: any)` (строки 116-121), чтобы AbortError обрабатывался отдельно:

```typescript
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      wasAborted = true
    } else {
      console.error('[ai] fatal error:', err)
      const friendly = friendlyError(err)
      window.webContents.send('chat:stream-chunk', { chatId, chunk: `⚠️ ${friendly}` })
      fullText += `⚠️ ${friendly}`
    }
  } finally {
    activeStreams.delete(chatId)
  }
```

- [ ] **Step 2: Сохранять флаг interrupted при записи ответа**

Изменить блок сохранения ответа (строки 123-127) так:

```typescript
  if (fullText) {
    db.insert(messages)
      .values({
        id: randomUUID(),
        chatId,
        role: 'assistant',
        content: fullText,
        interrupted: wasAborted ? true : null,
        createdAt: new Date(),
      })
      .run()
  }
```

(Если `wasAborted === true` и `fullText === ''` — ничего не сохраняем, что соответствует спецификации.)

- [ ] **Step 3: Проверить typecheck**

Run: `npm run typecheck:node`
Expected: без ошибок.

- [ ] **Step 4: Проверить, что main пересобрался**

Run: `npm run build 2>&1 | tail -5 && grep -c "wasAborted" out/main/index.js`
Expected: build успешен, grep возвращает число ≥ 1 (изменение попало в бандл).

- [ ] **Step 5: Commit**

```bash
git add src/main/ai.ts
git commit -m "feat(ai): handle AbortError and persist interrupted reply"
```

---

### Task 5: Чистая функция computeEditDeletions + editLastMessage (main)

**Files:**
- Modify: `src/main/ai.ts` (экспорт `computeEditDeletions`, `editLastMessage`)
- Test: `src/main/ai.edit.test.ts`

**Interfaces:**
- Consumes: тип записи сообщения (`{ id, role, interrupted, createdAt }`).
- Produces:
  - `export function computeEditDeletions(history: EditHistoryRow[]): string[]` — возвращает id сообщений на удаление: последний прерванный ответ ассистента (если он последний или предпоследний) + последнее пользовательское сообщение.
  - `export async function editLastMessage(params: { chatId: string; newMessage: string; window: BrowserWindow }): Promise<void>`.
- `EditHistoryRow = { id: string; role: 'user' | 'assistant' | 'tool'; interrupted: boolean | null }` (порядок массива = хронологический).

- [ ] **Step 1: Написать падающий тест на computeEditDeletions**

Create `src/main/ai.edit.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('./db', () => ({ db: {} }))
vi.mock('electron', () => ({ BrowserWindow: {} }))

import { computeEditDeletions } from './ai'

describe('computeEditDeletions', () => {
  it('removes the last user message and the trailing interrupted reply', () => {
    const ids = computeEditDeletions([
      { id: 'u1', role: 'user', interrupted: null },
      { id: 'a1', role: 'assistant', interrupted: null },
      { id: 'u2', role: 'user', interrupted: null },
      { id: 'a2', role: 'assistant', interrupted: true },
    ])
    expect(ids.sort()).toEqual(['a2', 'u2'])
  })

  it('removes only the last user message when no interrupted reply follows', () => {
    const ids = computeEditDeletions([
      { id: 'u1', role: 'user', interrupted: null },
      { id: 'u2', role: 'user', interrupted: null },
    ])
    expect(ids).toEqual(['u2'])
  })

  it('does not remove a completed (non-interrupted) reply', () => {
    const ids = computeEditDeletions([
      { id: 'u1', role: 'user', interrupted: null },
      { id: 'a1', role: 'assistant', interrupted: null },
    ])
    expect(ids).toEqual([])
  })

  it('returns empty array for empty history', () => {
    expect(computeEditDeletions([])).toEqual([])
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run src/main/ai.edit.test.ts`
Expected: FAIL — `computeEditDeletions` не экспортируется.

- [ ] **Step 3: Реализовать computeEditDeletions**

В `src/main/ai.ts` добавить:

```typescript
export type EditHistoryRow = {
  id: string
  role: 'user' | 'assistant' | 'tool'
  interrupted: boolean | null
}

export function computeEditDeletions(history: EditHistoryRow[]): string[] {
  const ids: string[] = []

  // Последний прерванный ответ ассистента в хвосте истории.
  const last = history[history.length - 1]
  if (last && last.role === 'assistant' && last.interrupted) {
    ids.push(last.id)
  }

  // Последнее пользовательское сообщение.
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') {
      ids.push(history[i].id)
      break
    }
  }

  return ids
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run src/main/ai.edit.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Реализовать editLastMessage**

В `src/main/ai.ts` добавить функцию (использует `computeEditDeletions`, импорты `inArray` из `drizzle-orm` — добавить в существующий импорт `import { eq } from 'drizzle-orm'` → `import { eq, inArray } from 'drizzle-orm'`):

```typescript
export async function editLastMessage(params: {
  chatId: string
  newMessage: string
  window: BrowserWindow
}): Promise<void> {
  const { chatId, newMessage, window } = params

  const history = db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(messages.createdAt)
    .all()

  const toDelete = computeEditDeletions(
    history.map((m) => ({ id: m.id, role: m.role, interrupted: m.interrupted })),
  )

  if (toDelete.length > 0) {
    db.delete(messages).where(inArray(messages.id, toDelete)).run()
  }

  await sendMessage({ chatId, userMessage: newMessage, window })
}
```

- [ ] **Step 6: Проверить typecheck + повторно прогнать тесты**

Run: `npm run typecheck:node && npx vitest run src/main/ai.edit.test.ts`
Expected: typecheck без ошибок, тесты PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/ai.ts src/main/ai.edit.test.ts
git commit -m "feat(ai): add editLastMessage with computeEditDeletions"
```

---

### Task 6: IPC и preload для stop / edit-last

**Files:**
- Modify: `src/main/ipc.ts` (импорт + 2 хендлера)
- Modify: `src/preload/index.ts` (2 метода API)

**Interfaces:**
- Consumes: `abortStream`, `editLastMessage` из Tasks 3-5.
- Produces:
  - IPC `chat:stop` (arg: `chatId: string`).
  - IPC `chat:edit-last` (arg: `{ chatId: string; message: string }`).
  - `window.electronAPI.stopMessage(chatId: string): Promise<void>`.
  - `window.electronAPI.editLastMessage(chatId: string, message: string): Promise<{ success: boolean }>`.

- [ ] **Step 1: Расширить импорт в ipc.ts**

В `src/main/ipc.ts` строку `import { sendMessage } from './ai'` заменить на:

```typescript
import { sendMessage, abortStream, editLastMessage } from './ai'
```

- [ ] **Step 2: Добавить хендлеры в ipc.ts**

После хендлера `chat:send` (строки 39-48) добавить:

```typescript
  ipcMain.handle('chat:stop', (_event, chatId: string) => {
    abortStream(chatId)
    return { success: true }
  })

  ipcMain.handle('chat:edit-last', async (event, { chatId, message }: { chatId: string; message: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)!
    try {
      await editLastMessage({ chatId, newMessage: message, window: win })
      return { success: true }
    } catch (err) {
      win.webContents.send('chat:stream-error', { chatId, error: String(err) })
      return { success: false, error: String(err) }
    }
  })
```

- [ ] **Step 3: Добавить методы в preload**

В `src/preload/index.ts` в объект `api`, после блока `sendMessage` (строки 35-36) добавить:

```typescript
  stopMessage: (chatId: string) => ipcRenderer.invoke('chat:stop', chatId) as Promise<{ success: boolean }>,
  editLastMessage: (chatId: string, message: string) =>
    ipcRenderer.invoke('chat:edit-last', { chatId, message }) as Promise<{ success: boolean }>,
```

- [ ] **Step 4: Проверить typecheck (оба процесса)**

Run: `npm run typecheck`
Expected: без ошибок (node + web).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat(ipc): wire chat:stop and chat:edit-last"
```

---

### Task 7: i18n-строки для остановки и редактирования

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts` (тип + 8 локалей)

**Interfaces:**
- Produces: ключи `stopGenerating`, `interruptedBadge`, `editingMessage`, `cancel` в типе `Translations` и во всех локалях.

- [ ] **Step 1: Добавить ключи в тип Translations**

В `src/renderer/src/i18n/translations.ts` в тип `Translations`, в секцию `// InputBar` (после `inputPlaceholder: string`) добавить:

```typescript
  stopGenerating: string
  interruptedBadge: string
  editingMessage: string
  cancel: string
```

- [ ] **Step 2: Добавить переводы во все 8 локалей**

В каждый объект локали (`en, ru, es, de, fr, pt, uk, tr`) добавить 4 ключа. Значения:

```text
en: stopGenerating:'Stop generating', interruptedBadge:'Stopped by user', editingMessage:'Editing message', cancel:'Cancel'
ru: stopGenerating:'Остановить генерацию', interruptedBadge:'Остановлено пользователем', editingMessage:'Редактирование сообщения', cancel:'Отмена'
es: stopGenerating:'Detener generación', interruptedBadge:'Detenido por el usuario', editingMessage:'Editando mensaje', cancel:'Cancelar'
de: stopGenerating:'Generierung stoppen', interruptedBadge:'Vom Benutzer gestoppt', editingMessage:'Nachricht bearbeiten', cancel:'Abbrechen'
fr: stopGenerating:'Arrêter la génération', interruptedBadge:'Arrêté par l’utilisateur', editingMessage:'Modification du message', cancel:'Annuler'
pt: stopGenerating:'Parar geração', interruptedBadge:'Interrompido pelo usuário', editingMessage:'Editando mensagem', cancel:'Cancelar'
uk: stopGenerating:'Зупинити генерацію', interruptedBadge:'Зупинено користувачем', editingMessage:'Редагування повідомлення', cancel:'Скасувати'
tr: stopGenerating:'Üretimi durdur', interruptedBadge:'Kullanıcı tarafından durduruldu', editingMessage:'Mesaj düzenleniyor', cancel:'İptal'
```

Каждый ключ оформить как `ключ: 'значение',` в соответствующем месте каждого объекта локали (рядом с остальными InputBar-ключами).

- [ ] **Step 3: Проверить typecheck (web)**

Run: `npm run typecheck:web`
Expected: без ошибок (если где-то локаль не получила ключ — TS укажет на отсутствующее свойство).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "i18n: add strings for stop/edit message"
```

---

### Task 8: useChat — состояние и методы stop/edit

**Files:**
- Modify: `src/renderer/src/hooks/useChat.ts`

**Interfaces:**
- Consumes: `window.electronAPI.stopMessage`, `editLastMessage` (Task 6).
- Produces (в возвращаемом объекте хука):
  - `stopMessage: () => void`
  - `editingContent: string | null`
  - `startEdit: (content: string) => void`
  - `cancelEdit: () => void`
  - `editLastMessage: (newText: string) => Promise<void>`
  - тип `Message` получает поле `interrupted?: boolean`.

- [ ] **Step 1: Расширить тип Message и прокинуть interrupted в loadMessages**

В `src/renderer/src/hooks/useChat.ts` тип `Message` (строки 3-7):

```typescript
export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  interrupted?: boolean
}
```

В `loadMessages` (строки 30-39) добавить поле в маппинг:

```typescript
      msgs.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        interrupted: (m as { interrupted?: boolean }).interrupted ?? false,
      })),
```

- [ ] **Step 2: Добавить состояние editingContent**

После строки `const [hasApiKeys, setHasApiKeys] = useState(true)` (строка 23) добавить:

```typescript
  const [editingContent, setEditingContent] = useState<string | null>(null)
```

- [ ] **Step 3: Добавить методы stopMessage / startEdit / cancelEdit / editLastMessage**

После `sendMessage` (строки 121-134) добавить:

```typescript
  const stopMessage = useCallback(() => {
    if (!activeChatId) return
    window.electronAPI.stopMessage(activeChatId)
  }, [activeChatId])

  const startEdit = useCallback((content: string) => {
    setEditingContent(content)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingContent(null)
  }, [])

  const editLastMessage = useCallback(
    async (newText: string) => {
      if (!activeChatId || isStreaming) return
      setEditingContent(null)
      // Оптимистично убираем последний прерванный ответ ассистента из UI.
      setMessages((prev) => {
        const copy = [...prev]
        if (copy.length && copy[copy.length - 1].role === 'assistant' && copy[copy.length - 1].interrupted) {
          copy.pop()
        }
        // Заменяем последнее пользовательское сообщение новым текстом.
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === 'user') {
            copy[i] = { ...copy[i], content: newText }
            break
          }
        }
        return copy
      })
      setIsStreaming(true)
      streamingContentRef.current = ''
      setStreamingContent('')
      await window.electronAPI.editLastMessage(activeChatId, newText)
    },
    [activeChatId, isStreaming],
  )
```

- [ ] **Step 4: Экспортировать новые значения из хука**

В возвращаемом объекте (строки 152-165) добавить:

```typescript
    stopMessage,
    editingContent,
    startEdit,
    cancelEdit,
    editLastMessage,
```

- [ ] **Step 5: Проверить typecheck (web)**

Run: `npm run typecheck:web`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/hooks/useChat.ts
git commit -m "feat(useChat): add stop/edit state and actions"
```

---

### Task 9: InputBar — кнопка стоп и режим редактирования

**Files:**
- Modify: `src/renderer/src/components/InputBar.tsx`

**Interfaces:**
- Consumes: `tr.stopGenerating`, `tr.editingMessage`, `tr.cancel` (Task 7).
- Produces: новые пропсы `onStop: () => void`, `editingContent: string | null`, `onEditSubmit: (text: string) => void`, `onCancelEdit: () => void`. Существующие `onSend`, `disabled` остаются.

- [ ] **Step 1: Обновить интерфейс пропсов и импорты**

В `src/renderer/src/components/InputBar.tsx`:

```typescript
import { useState, useEffect, KeyboardEvent } from 'react'
import { SendHorizontal, Square, X } from 'lucide-react'
import { useTr } from '../i18n/LanguageContext'

interface InputBarProps {
  onSend: (message: string) => void
  disabled: boolean
  isStreaming: boolean
  onStop: () => void
  editingContent: string | null
  onEditSubmit: (text: string) => void
  onCancelEdit: () => void
}
```

- [ ] **Step 2: Синхронизировать поле ввода с режимом редактирования**

В теле компонента после `const [value, setValue] = useState('')` добавить эффект:

```typescript
  useEffect(() => {
    if (editingContent !== null) setValue(editingContent)
  }, [editingContent])
```

- [ ] **Step 3: Обновить логику отправки**

Заменить `handleSend` и `handleKeyDown`:

```typescript
  const isEditing = editingContent !== null

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    if (isEditing) {
      onEditSubmit(trimmed)
    } else {
      onSend(trimmed)
    }
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
```

- [ ] **Step 4: Добавить плашку редактирования и кнопку стоп в разметку**

Заменить корневой `return (...)` на:

```tsx
  return (
    <div className="flex flex-col" style={{ borderTop: '1px solid #2a2a2a', background: '#111111' }}>
      {isEditing && (
        <div className="flex items-center justify-between px-4 pt-3 text-xs" style={{ color: '#8B8D98' }}>
          <span>{tr.editingMessage}</span>
          <button
            onClick={() => { onCancelEdit(); setValue('') }}
            className="flex items-center gap-1 hover:opacity-80"
            style={{ color: '#8B8D98' }}
          >
            <X className="h-3.5 w-3.5" />
            {tr.cancel}
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 p-4">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tr.inputPlaceholder}
          rows={1}
          className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none"
          style={{
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            color: '#e8e8e8',
            minHeight: '48px',
            maxHeight: '200px',
          }}
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 200) + 'px'
          }}
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            title={tr.stopGenerating}
            className="flex items-center justify-center rounded-xl transition-colors animate-pulse"
            style={{ width: '48px', height: '48px', background: '#585B65', color: '#e8e8e8', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#6e7180' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#585B65' }}
          >
            <Square className="h-4 w-4" fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim()}
            className="flex items-center justify-center rounded-xl transition-colors"
            style={{
              width: '48px',
              height: '48px',
              background: !value.trim() ? '#2a2a2a' : '#585B65',
              color: !value.trim() ? '#585B65' : '#e8e8e8',
              flexShrink: 0,
            }}
            onMouseEnter={e => { if (value.trim()) e.currentTarget.style.background = '#6e7180' }}
            onMouseLeave={e => { if (value.trim()) e.currentTarget.style.background = '#585B65' }}
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
```

Примечание: `textarea` больше не использует `disabled` — поле остаётся активным во время стрима (можно печатать следующий вопрос), отправка блокируется через `disabled` в `handleSend`.

- [ ] **Step 5: Проверить typecheck (web)**

Run: `npm run typecheck:web`
Expected: ошибки в `Chat.tsx` (InputBar требует новые пропсы) — это ожидаемо, исправим в Task 11. Сам `InputBar.tsx` ошибок содержать не должен.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/InputBar.tsx
git commit -m "feat(InputBar): stop button and edit mode"
```

---

### Task 10: Message — бейдж «прервано» и карандаш редактирования

**Files:**
- Modify: `src/renderer/src/components/Message.tsx`

**Interfaces:**
- Consumes: `tr.interruptedBadge` (Task 7).
- Produces: новые пропсы `interrupted?: boolean`, `onEdit?: () => void`. Существующие `role`, `content`, `isStreaming` остаются.

- [ ] **Step 1: Обновить пропсы и импорты**

В `src/renderer/src/components/Message.tsx`:

```typescript
import ReactMarkdown from 'react-markdown'
import { Pencil } from 'lucide-react'
import { useTr } from '../i18n/LanguageContext'

interface MessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  interrupted?: boolean
  onEdit?: () => void
}

export function Message({ role, content, isStreaming, interrupted, onEdit }: MessageProps) {
  const isUser = role === 'user'
  const { tr } = useTr()
```

- [ ] **Step 2: Добавить бейдж и карандаш в разметку**

Заменить тело `return`:

```tsx
  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 items-center gap-2`}>
      {isUser && onEdit && (
        <button
          onClick={onEdit}
          title={tr.editingMessage}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          style={{ color: '#8B8D98' }}
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
      <div
        className="max-w-[80%] rounded-2xl px-4 py-3 text-sm"
        style={isUser
          ? { background: '#585B65', color: '#e8e8e8' }
          : { background: '#1a1a1a', color: '#e8e8e8', border: '1px solid #2a2a2a' }
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="message-prose">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && <span className="animate-pulse">▋</span>}
            {interrupted && (
              <p className="mt-2 text-xs flex items-center gap-1" style={{ color: '#8B8D98' }}>
                ⏹ {tr.interruptedBadge}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
```

- [ ] **Step 3: Проверить typecheck (web)**

Run: `npm run typecheck:web`
Expected: ошибки только в `Chat.tsx`/`MessageList.tsx` (несвязанные пропсы) — поправим в Task 11. `Message.tsx` ошибок не содержит.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Message.tsx
git commit -m "feat(Message): interrupted badge and edit pencil"
```

---

### Task 11: Прокинуть всё через MessageList и Chat

**Files:**
- Modify: `src/renderer/src/components/MessageList.tsx`
- Modify: `src/renderer/src/components/Chat.tsx`
- Modify: `src/renderer/src/App.tsx` (если он раздаёт пропсы из useChat — проверить)

**Interfaces:**
- Consumes: всё из Tasks 8-10.
- Produces: рабочая связка UI ↔ useChat.

- [ ] **Step 1: Проверить, как App раздаёт пропсы**

Run: `grep -n "useChat\|<Chat" src/renderer/src/App.tsx`
Expected: увидеть деструктуризацию `useChat()` и место рендера `<Chat ... />`. Добавить в деструктуризацию: `stopMessage, editingContent, startEdit, cancelEdit, editLastMessage` и прокинуть их в `<Chat>` (см. Step 3).

- [ ] **Step 2: Обновить MessageList**

Заменить `src/renderer/src/components/MessageList.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { Message } from './Message'

type MessageData = { id: string; role: 'user' | 'assistant'; content: string; interrupted?: boolean }

interface MessageListProps {
  messages: MessageData[]
  streamingContent: string
  isStreaming: boolean
  onEditLast: (content: string) => void
}

export function MessageList({ messages, streamingContent, isStreaming, onEditLast }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streamingContent])

  // Индекс последнего пользовательского сообщения.
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { lastUserIdx = i; break }
  }
  // Карандаш доступен: нет активного стрима И после последнего своего
  // сообщения нет ответа ассистента ИЛИ последний ответ interrupted.
  const after = lastUserIdx >= 0 ? messages.slice(lastUserIdx + 1) : []
  const canEditLast =
    !isStreaming &&
    lastUserIdx >= 0 &&
    (after.length === 0 || (after[after.length - 1].role === 'assistant' && !!after[after.length - 1].interrupted))

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((msg, idx) => (
        <Message
          key={msg.id}
          role={msg.role}
          content={msg.content}
          interrupted={msg.interrupted}
          onEdit={canEditLast && idx === lastUserIdx ? () => onEditLast(msg.content) : undefined}
        />
      ))}
      {isStreaming && <Message role="assistant" content={streamingContent} isStreaming={true} />}
    </div>
  )
}
```

- [ ] **Step 3: Обновить Chat**

В `src/renderer/src/components/Chat.tsx` обновить тип `Message`, `ChatProps` и проброс:

Тип сообщения (строка 6):

```typescript
type Message = { id: string; role: 'user' | 'assistant'; content: string; interrupted?: boolean }
```

В `ChatProps` (строки 8-16) добавить:

```typescript
  onStop: () => void
  editingContent: string | null
  onStartEdit: (content: string) => void
  onCancelEdit: () => void
  onEditSubmit: (text: string) => void
```

В деструктуризацию пропсов (строки 18-21) добавить эти же имена.

Заменить финальный блок рендера (строки 63-68):

```tsx
  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: '#111111' }}>
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        onEditLast={onStartEdit}
      />
      <InputBar
        onSend={onSend}
        disabled={isStreaming}
        isStreaming={isStreaming}
        onStop={onStop}
        editingContent={editingContent}
        onEditSubmit={onEditSubmit}
        onCancelEdit={onCancelEdit}
      />
    </div>
  )
```

- [ ] **Step 4: Прокинуть пропсы из App в Chat**

В `src/renderer/src/App.tsx` в месте рендера `<Chat ... />` добавить:

```tsx
        onStop={stopMessage}
        editingContent={editingContent}
        onStartEdit={startEdit}
        onCancelEdit={cancelEdit}
        onEditSubmit={editLastMessage}
```

(точные имена должны совпадать с тем, что вернул `useChat` в Task 8.)

- [ ] **Step 5: Полный typecheck**

Run: `npm run typecheck`
Expected: без ошибок (node + web). Если остались — устранить несоответствия имён пропсов.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/MessageList.tsx src/renderer/src/components/Chat.tsx src/renderer/src/App.tsx
git commit -m "feat(ui): wire stop/edit through MessageList and Chat"
```

---

### Task 12: Ручная end-to-end проверка

**Files:** нет (только запуск приложения).

**Interfaces:** Consumes: всё вышеперечисленное.

- [ ] **Step 1: Прогнать все unit-тесты**

Run: `npm test`
Expected: все тесты PASS (Tasks 3 и 5).

- [ ] **Step 2: Собрать и убедиться, что main-изменения в бандле**

Run: `npm run build 2>&1 | tail -5 && grep -c "chat:stop\|editLastMessage\|interrupted" out/main/index.js`
Expected: build успешен, grep ≥ 1.

- [ ] **Step 3: Запустить приложение**

Run: `npm run dev`

- [ ] **Step 4: Сценарий «стоп с частичным ответом»**

1. Открыть/создать чат, задать вопрос, провоцирующий длинный ответ.
2. Во время стрима кнопка отправки превратилась в пульсирующий квадрат — нажать его.
3. Ожидается: стрим прекратился, частичный ответ остался, под ним бейдж «⏹ Остановлено пользователем».

- [ ] **Step 5: Сценарий «редактирование после остановки»**

1. После остановки навести курсор на своё последнее сообщение — появился карандаш.
2. Нажать карандаш — текст подставился в поле, над полем плашка «Редактирование сообщения · ✕ Отмена».
3. Изменить текст, отправить.
4. Ожидается: прерванный ответ исчез, старое сообщение заменилось новым, пошёл новый ответ.

- [ ] **Step 6: Сценарий «стоп до первого чанка»**

1. Задать вопрос и нажать стоп сразу же.
2. Ожидается: индикатор стрима исчез, осталось только сообщение пользователя; карандаш доступен; правка работает.

- [ ] **Step 7: Проверить, что обычная отправка не сломана**

1. Задать вопрос и дождаться полного ответа.
2. Ожидается: ответ без бейджа «прервано»; карандаш у последнего своего сообщения отсутствует (по спецификации — только после остановки).

Примечание по Step 7: при полном (не прерванном) ответе `canEditLast` всё равно `true`, если после юзер-сообщения идёт завершённый ответ? Нет — условие требует `after[last].interrupted === true`, поэтому карандаш скрыт. Это соответствует выбранному поведению «редактирование только после остановки».

- [ ] **Step 8: Commit (если потребовались правки)**

```bash
git add -A
git commit -m "fix: adjustments from manual e2e of stop/edit"
```

(Если правок не было — шаг пропустить.)
