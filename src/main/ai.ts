import { streamText, stepCountIs } from 'ai'
import { BrowserWindow } from 'electron'
import { db } from './db'
import { messages, memory, chats } from './db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { allTools } from './tools'
import { getModel } from './ai-model'
import { maybeSummarize } from './summarization'

function friendlyError(err: any): string {
  const msg = String(err?.message ?? err ?? '')
  const status = err?.statusCode ?? err?.status ?? err?.cause?.status

  if (status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
    return 'Rate limit exceeded. Please wait a moment and try again.'
  }
  if (status === 402 || msg.includes('402') || msg.toLowerCase().includes('credit') || msg.toLowerCase().includes('billing') || msg.toLowerCase().includes('quota')) {
    return 'API credits exhausted. Please top up your balance in the provider dashboard.'
  }
  if (status === 401 || msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('api key')) {
    return 'Invalid API key. Please check your key in Settings.'
  }
  if (status === 503 || msg.includes('503') || msg.toLowerCase().includes('overloaded') || msg.toLowerCase().includes('unavailable')) {
    return 'The AI provider is temporarily overloaded. Please try again in a few seconds.'
  }
  if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('econnrefused') || msg.toLowerCase().includes('fetch')) {
    return 'Network error. Please check your internet connection.'
  }
  return `Unexpected error: ${msg}`
}

function buildSystemPrompt(summary: string | null): string {
  const memories = db.select().from(memory).all()
  const memorySection =
    memories.length > 0
      ? '\n\nKnown facts about the user:\n' + memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')
      : ''

  const summarySection = summary
    ? `\n\nPrevious conversation summary (older messages have been compressed to save tokens — treat these as established context):\n${summary}`
    : ''

  return `You are a knowledgeable and empathetic astrology consultant. You help users explore astrology, numerology, tarot, Human Design, and related esoteric systems.

You have access to a suite of astrology tools — use them proactively when relevant. For example:
- If the user mentions their birth date and asks about their personality, call get_natal_chart
- If they ask about current influences, call get_transits
- If they ask about compatibility, call get_synastry
- If they share important personal info (name, birth data, etc.), call save_memory immediately

IMPORTANT: When calling any chart or transit tool, you MUST provide both birthPlace (city name only, e.g. "Moscow") and countryCode (ISO 3166-1 alpha-2, e.g. "RU"). Infer countryCode from context — if a user says "Москва" or "Moscow", use countryCode "RU". Never call chart tools without countryCode.


Always interpret API results in a warm, insightful way. Translate technical astrological data into meaningful insights.${memorySection}${summarySection}

Today's date: ${new Date().toISOString().split('T')[0]}`
}

export interface SendMessageParams {
  chatId: string
  userMessage: string
  window: BrowserWindow
}

export async function sendMessage({ chatId, userMessage, window }: SendMessageParams): Promise<void> {
  db.insert(messages)
    .values({ id: randomUUID(), chatId, role: 'user', content: userMessage, createdAt: new Date() })
    .run()

  try {
    await maybeSummarize(chatId)
  } catch (err) {
    console.error('[ai] summarization failed, continuing with full history:', err)
  }

  const chatRow = db.select().from(chats).where(eq(chats.id, chatId)).get()
  const summary = chatRow?.summary ?? null
  const cutoffId = chatRow?.summarizedUpToMessageId ?? null

  let history = db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.createdAt).all()
  if (cutoffId) {
    const cutoffMsg = history.find((m) => m.id === cutoffId)
    if (cutoffMsg) {
      history = history.filter((m) => m.createdAt > cutoffMsg.createdAt)
    }
  }

  let fullText = ''

  try {
    const result = streamText({
      model: getModel(),
      system: buildSystemPrompt(summary),
      messages: history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      tools: allTools,
      stopWhen: stepCountIs(10),
    })

    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') {
        fullText += chunk.text
        window.webContents.send('chat:stream-chunk', { chatId, chunk: chunk.text })
      } else if (chunk.type === 'tool-call') {
        console.log('[ai] tool-call:', chunk.toolName, JSON.stringify((chunk as any).input ?? (chunk as any).args, null, 2))
      } else if (chunk.type === 'tool-result') {
        console.log('[ai] tool-result:', chunk.toolName, JSON.stringify((chunk as any).output ?? (chunk as any).result, null, 2))
      } else if (chunk.type === 'error') {
        const err = chunk.error as any
        console.error('[ai] stream error:', err)
        const friendly = friendlyError(err)
        window.webContents.send('chat:stream-chunk', { chatId, chunk: `\n\n⚠️ ${friendly}` })
        fullText += `\n\n⚠️ ${friendly}`
      }
    }
  } catch (err: any) {
    console.error('[ai] fatal error:', err)
    const friendly = friendlyError(err)
    window.webContents.send('chat:stream-chunk', { chatId, chunk: `⚠️ ${friendly}` })
    fullText += `⚠️ ${friendly}`
  }

  if (fullText) {
    db.insert(messages)
      .values({ id: randomUUID(), chatId, role: 'assistant', content: fullText, createdAt: new Date() })
      .run()
  }

  db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId)).run()

  if (chatRow?.title === 'New Chat') {
    const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '')
    db.update(chats).set({ title }).where(eq(chats.id, chatId)).run()
  }

  window.webContents.send('chat:stream-end', { chatId })
}
