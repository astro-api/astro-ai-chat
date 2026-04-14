import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { streamText, stepCountIs } from 'ai'
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
  // Save user message
  db.insert(messages)
    .values({ id: randomUUID(), chatId, role: 'user', content: userMessage, createdAt: new Date() })
    .run()

  // Load chat history
  const history = db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.createdAt).all()

  const openrouter = getOpenRouterClient()
  const modelId = getModel()

  const result = streamText({
    model: openrouter(modelId),
    system: buildSystemPrompt(),
    messages: history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    tools: allTools,
    stopWhen: stepCountIs(10),
  })

  let fullText = ''

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      fullText += chunk.text
      window.webContents.send('chat:stream-chunk', { chatId, chunk: chunk.text })
    }
  }

  // Save assistant response
  db.insert(messages)
    .values({ id: randomUUID(), chatId, role: 'assistant', content: fullText, createdAt: new Date() })
    .run()

  // Update chat's updatedAt
  db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId)).run()

  // Auto-generate title from first user message
  const chatRow = db.select().from(chats).where(eq(chats.id, chatId)).get()
  if (chatRow?.title === 'New Chat') {
    const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '')
    db.update(chats).set({ title }).where(eq(chats.id, chatId)).run()
  }

  window.webContents.send('chat:stream-end', { chatId })
}
