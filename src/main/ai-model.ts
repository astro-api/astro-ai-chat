import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import type { LanguageModel } from 'ai'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { settings } from './db/schema'

function getSetting(key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value
}

export function getModel(): LanguageModel {
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
