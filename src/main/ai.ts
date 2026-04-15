import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { streamText, stepCountIs } from 'ai'
import { BrowserWindow } from 'electron'
import { db } from './db'
import { messages, memory, settings, chats } from './db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { allTools } from './tools'

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

function getSetting(key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value
}

function getModel() {
  const provider = getSetting('provider') ?? 'openrouter'
  const modelId = getSetting('model') ?? 'anthropic/claude-sonnet-4-5'

  switch (provider) {
    case 'openai': {
      const apiKey = getSetting('OPENAI_API_KEY')
      if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
      return createOpenAI({ apiKey })(modelId)
    }
    case 'anthropic': {
      const apiKey = getSetting('ANTHROPIC_API_KEY')
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
      return createAnthropic({ apiKey })(modelId)
    }
    case 'google': {
      const apiKey = getSetting('GOOGLE_API_KEY')
      if (!apiKey) throw new Error('GOOGLE_API_KEY not configured')
      return createGoogleGenerativeAI({ apiKey })(modelId)
    }
    case 'mistral': {
      const apiKey = getSetting('MISTRAL_API_KEY')
      if (!apiKey) throw new Error('MISTRAL_API_KEY not configured')
      return createMistral({ apiKey })(modelId)
    }
    case 'openrouter':
    default: {
      const apiKey = getSetting('OPENROUTER_API_KEY')
      if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured')
      return createOpenRouter({ apiKey })(modelId)
    }
  }
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

IMPORTANT: When calling any chart or transit tool, you MUST provide both birthPlace (city name only, e.g. "Moscow") and countryCode (ISO 3166-1 alpha-2, e.g. "RU"). Infer countryCode from context — if a user says "Москва" or "Moscow", use countryCode "RU". Never call chart tools without countryCode.


Always interpret API results in a warm, insightful way. Translate technical astrological data into meaningful insights.${memorySection}

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

  const history = db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.createdAt).all()

  let fullText = ''

  try {
    const result = streamText({
      model: getModel(),
      system: buildSystemPrompt(),
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

  const chatRow = db.select().from(chats).where(eq(chats.id, chatId)).get()
  if (chatRow?.title === 'New Chat') {
    const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '')
    db.update(chats).set({ title }).where(eq(chats.id, chatId)).run()
  }

  window.webContents.send('chat:stream-end', { chatId })
}
