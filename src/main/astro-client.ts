import { AstrologyClient } from '@astro-api/astroapi-typescript'
import { db } from './db'
import { settings } from './db/schema'
import { eq } from 'drizzle-orm'

let _client: AstrologyClient | null = null

export async function getAstroClient(): Promise<AstrologyClient> {
  if (_client) return _client

  const row = db.select().from(settings).where(eq(settings.key, 'ASTROLOGY_API_KEY')).get()
  const apiKey = row?.value

  if (!apiKey) {
    throw new Error('ASTROLOGY_API_KEY not configured. Please set it in Settings.')
  }

  _client = new AstrologyClient({ apiKey })
  return _client
}

export function resetAstroClient(): void {
  _client = null
}
