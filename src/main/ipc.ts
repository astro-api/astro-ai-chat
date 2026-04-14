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
}
