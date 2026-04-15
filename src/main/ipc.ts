import { ipcMain, BrowserWindow } from 'electron'
import { db } from './db'
import { chats, messages, memory, settings } from './db/schema'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { sendMessage } from './ai'
import { resetAstroClient } from './astro-client'

export function registerIpcHandlers(): void {
  // ── Chats ─────────────────────────────────────────────────────────────────────

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

  ipcMain.handle('chat:rename', (_event, { chatId, title }: { chatId: string; title: string }) => {
    db.update(chats).set({ title, updatedAt: new Date() }).where(eq(chats.id, chatId)).run()
    return { success: true }
  })

  // ── Messaging / Streaming ─────────────────────────────────────────────────────

  ipcMain.handle('chat:send', async (event, { chatId, message }: { chatId: string; message: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)!
    try {
      await sendMessage({ chatId, userMessage: message, window: win })
      return { success: true }
    } catch (err) {
      win.webContents.send('chat:stream-error', { chatId, error: String(err) })
      return { success: false, error: String(err) }
    }
  })

  // ── Memory ────────────────────────────────────────────────────────────────────

  ipcMain.handle('memory:list', () => {
    return db.select().from(memory).all()
  })

  ipcMain.handle('memory:delete', (_event, key: string) => {
    db.delete(memory).where(eq(memory.key, key)).run()
    return { success: true }
  })

  // ── Settings ──────────────────────────────────────────────────────────────────

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

  // ── Window ────────────────────────────────────────────────────────────────────

  ipcMain.handle('window:set-title', (event, title: string) => {
    BrowserWindow.fromWebContents(event.sender)?.setTitle(title)
  })

  // ── Models ────────────────────────────────────────────────────────────────────

  ipcMain.handle('models:list', async (_event, provider: string) => {
    const getKey = (key: string) => db.select().from(settings).where(eq(settings.key, key)).get()?.value

    // Static models for providers without list API
    const staticModels: Record<string, string[]> = {
      anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
      mistral: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'codestral-latest', 'open-mistral-nemo'],
    }
    if (staticModels[provider]) return { models: staticModels[provider] }

    try {
      if (provider === 'openrouter') {
        const apiKey = getKey('OPENROUTER_API_KEY')
        if (!apiKey) return { models: [] }
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        const json = await res.json() as any
        return { models: (json.data ?? []).map((m: any) => m.id).sort() }
      }

      if (provider === 'openai') {
        const apiKey = getKey('OPENAI_API_KEY')
        if (!apiKey) return { models: [] }
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        const json = await res.json() as any
        const models = (json.data ?? []).map((m: any) => m.id).filter((id: string) => id.startsWith('gpt') || id.startsWith('o')).sort()
        return { models }
      }

      if (provider === 'google') {
        const apiKey = getKey('GOOGLE_API_KEY')
        if (!apiKey) return { models: [] }
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
        const json = await res.json() as any
        const models = (json.models ?? []).map((m: any) => m.name.replace('models/', '')).sort()
        return { models }
      }
    } catch (e) {
      console.error('[models:list] error:', e)
    }
    return { models: [] }
  })
}
