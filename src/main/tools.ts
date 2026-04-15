import { tool } from 'ai'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { db } from './db'
import { memory, settings } from './db/schema'
import { eq } from 'drizzle-orm'
import { getAstroClient } from './astro-client'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [datePart] = dateStr.split(' ')
  const [year, month, day] = datePart.split('-').map(Number)
  return { year, month, day }
}

function parseTimeParts(timeStr: string): { hour: number; minute: number } {
  const [hour, minute] = timeStr.split(':').map(Number)
  return { hour: hour ?? 0, minute: minute ?? 0 }
}

function buildSubject(
  birthDate: string,
  birthTime: string,
  birthPlace: string,
  countryCode?: string,
  lat?: number,
  lon?: number,
) {
  const { year, month, day } = parseDateParts(birthDate)
  const { hour, minute } = parseTimeParts(birthTime)

  // API requires either (city + country_code) or (latitude + longitude)
  const hasCoords = lat != null && lon != null
  return {
    birth_data: {
      year,
      month,
      day,
      hour,
      minute,
      second: 0,
      city: hasCoords ? null : birthPlace,
      country_code: hasCoords ? null : (countryCode ?? null),
      latitude: hasCoords ? lat : null,
      longitude: hasCoords ? lon : null,
    },
  }
}

// ─── Memory Tools ──────────────────────────────────────────────────────────────

export const saveMemoryTool = tool({
  description:
    'Save a fact about the user to persistent memory. Use this when the user mentions important personal information: name, birth date, birth time, birth place, relationship status, preferences, or any fact useful for future astrology readings.',
  inputSchema: z.object({
    key: z.string().describe('Short key for the fact, e.g. "birth_date", "birth_place", "name", "partner_birth_date"'),
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
  inputSchema: z.object({}),
  execute: async () => {
    const rows = db.select().from(memory).all()
    return { memories: rows.map((r) => ({ key: r.key, value: r.value })) }
  },
})

// ─── Astrology Tools ───────────────────────────────────────────────────────────

export const getNatalChartTool = tool({
  description:
    'Generate a natal (birth) chart showing planetary positions, house cusps, and aspects for a given person.',
  inputSchema: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
    birthPlace: z.string().describe('City name, e.g. "Moscow"'),
    countryCode: z.string().describe('ISO 3166-1 alpha-2 country code, e.g. "RU", "US", "GB". Required when using city.'),
    lat: z.number().optional().describe('Latitude — provide instead of city+countryCode for precision'),
    lon: z.number().optional().describe('Longitude — provide instead of city+countryCode for precision'),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, countryCode, lat, lon }) => {
    try {
      const client = await getAstroClient()
      return await client.charts.getNatalChart({ subject: buildSubject(birthDate, birthTime, birthPlace, countryCode, lat, lon) })
    } catch (e: any) {
      console.error('[get_natal_chart] error:', e)
      console.error('[get_natal_chart] details:', JSON.stringify(e?.details ?? e?.cause?.body, null, 2))
      return { error: String(e), details: e?.details ?? e?.cause?.body }
    }
  },
})

export const getTransitsTool = tool({
  description:
    'Calculate current or future planetary transits to a natal chart. Shows how current planetary positions affect the birth chart.',
  inputSchema: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
    birthPlace: z.string().describe('City name for birth location, e.g. "Moscow"'),
    countryCode: z.string().describe('ISO 3166-1 alpha-2 country code, e.g. "RU", "US", "GB"'),
    transitDate: z.string().optional().describe('Date for transit calculation in YYYY-MM-DD format (defaults to today)'),
    transitPlace: z.string().optional().describe('City for transit location — defaults to birthPlace'),
    transitCountryCode: z.string().optional().describe('Country code for transit location — defaults to countryCode'),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, countryCode, transitDate, transitPlace, transitCountryCode, lat, lon }) => {
    try {
      const client = await getAstroClient()
      const now = new Date()
      const tDateStr = transitDate ?? now.toISOString().split('T')[0]
      const { year, month, day } = parseDateParts(tDateStr)
      const tCity = transitPlace ?? birthPlace
      const tCountry = transitCountryCode ?? countryCode
      return await client.charts.getTransitChart({
        natal_subject: buildSubject(birthDate, birthTime, birthPlace, countryCode, lat, lon),
        transit_datetime: {
          year, month, day,
          hour: now.getHours(),
          minute: now.getMinutes(),
          city: tCity,
          country_code: tCountry,
        } as any,
      })
    } catch (e: any) {
      console.error('[get_transits] error:', e)
      console.error('[get_transits] details:', JSON.stringify(e?.details ?? e?.cause?.body, null, 2))
      return { error: String(e), details: e?.details ?? e?.cause?.body }
    }
  },
})

const personSchema = z.object({
  birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
  birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
  birthPlace: z.string().describe('City name, e.g. "Moscow"'),
  countryCode: z.string().describe('ISO 3166-1 alpha-2 country code, e.g. "RU", "US", "GB"'),
  lat: z.number().optional(),
  lon: z.number().optional(),
})

export const getSynastryTool = tool({
  description: 'Calculate synastry (relationship compatibility) chart between two people.',
  inputSchema: z.object({
    person1: personSchema.describe('Birth data for the first person'),
    person2: personSchema.describe('Birth data for the second person'),
  }),
  execute: async ({ person1, person2 }) => {
    try {
      const client = await getAstroClient()
      return await client.charts.getSynastryChart({
        subject1: buildSubject(person1.birthDate, person1.birthTime, person1.birthPlace, person1.countryCode, person1.lat, person1.lon),
        subject2: buildSubject(person2.birthDate, person2.birthTime, person2.birthPlace, person2.countryCode, person2.lat, person2.lon),
      })
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getHoroscopeTool = tool({
  description: 'Get a horoscope forecast for a zodiac sign for the specified time period.',
  inputSchema: z.object({
    sign: z
      .enum(['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'])
      .describe('Zodiac sign (capitalized)'),
    period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('daily').describe('Time period'),
  }),
  execute: async ({ sign, period }) => {
    try {
      const client = await getAstroClient()
      const today = new Date().toISOString().split('T')[0]
      if (period === 'daily') {
        return await client.horoscope.getSignDailyHoroscope({ sign, date: today })
      } else if (period === 'weekly') {
        return await client.horoscope.getSignWeeklyHoroscope({ sign })
      } else if (period === 'monthly') {
        return await client.horoscope.getSignMonthlyHoroscope({ sign })
      } else {
        return await client.horoscope.getSignYearlyHoroscope({ sign })
      }
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getNumerologyTool = tool({
  description: 'Calculate core numerology numbers (Life Path, Expression, Soul Urge, etc.) for a person.',
  inputSchema: z.object({
    name: z.string().describe("The person's full name"),
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
  }),
  execute: async ({ name, birthDate }) => {
    try {
      const client = await getAstroClient()
      const { year, month, day } = parseDateParts(birthDate)
      return await client.numerology.getCoreNumbers({
        subject: { name, birth_data: { year, month, day, hour: 0, minute: 0, second: 0 } },
      })
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getTarotReadingTool = tool({
  description: 'Perform a tarot card reading. Returns drawn cards with interpretations.',
  inputSchema: z.object({
    spread: z.enum(['single', 'three-card', 'celtic-cross']).default('three-card').describe('Type of tarot spread'),
    question: z.string().optional().describe('Optional question for the reading'),
  }),
  execute: async ({ spread, question }) => {
    console.log('[get_tarot_reading] called with:', { spread, question })
    try {
      const client = await getAstroClient()
      const spreadTypeMap = { single: 'single', 'three-card': 'three_card', 'celtic-cross': 'celtic_cross' } as const
      const reportRequest = {
        spread_type: spreadTypeMap[spread],
        use_reversals: true,
        include_dignities: false,
        include_timing: false,
        include_astro_context: false,
        include_birth_cards: false,
        interpretation_depth: 'detailed' as const,
        language: 'ru',
      } as any
      console.log('[get_tarot_reading] request:', JSON.stringify(reportRequest, null, 2))
      if (spread === 'single') {
        return await client.tarot.generateSingleReport(reportRequest)
      } else if (spread === 'three-card') {
        return await client.tarot.generateThreeCardReport(reportRequest)
      } else {
        return await client.tarot.generateCelticCrossReport(reportRequest)
      }
    } catch (e: any) {
      console.error('[get_tarot_reading] error:', e)
      console.error('[get_tarot_reading] details:', JSON.stringify(e?.details ?? e?.cause?.body, null, 2))
      return { error: String(e), details: e?.details ?? e?.cause?.body }
    }
  },
})

export const getHumanDesignTool = tool({
  description: 'Get Human Design bodygraph analysis for a person (type, strategy, authority, profile, centers, channels, gates).',
  inputSchema: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM — precision is critical for Human Design'),
    birthPlace: z.string().describe('City name, e.g. "Kyiv"'),
    countryCode: z.string().describe('ISO 3166-1 alpha-2 country code, e.g. "UA", "RU", "US"'),
    name: z.string().optional().describe('Person name'),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, countryCode, name }) => {
    try {
      const row = db.select().from(settings).where(eq(settings.key, 'ASTROLOGY_API_KEY')).get()
      if (!row?.value) throw new Error('ASTROLOGY_API_KEY not configured')
      const { year, month, day } = parseDateParts(birthDate)
      const { hour, minute } = parseTimeParts(birthTime)
      const body = {
        subject: {
          name: name ?? 'Subject',
          birth_data: { year, month, day, hour, minute, second: 0, city: birthPlace, country_code: countryCode },
        },
        options: { include_interpretations: true, language: 'ru' },
        hd_options: { include_channels: true, include_design_chart: true },
      }
      console.log('[get_human_design] request:', JSON.stringify(body, null, 2))
      const res = await fetch('https://api.astrology-api.io/api/v3/human-design/bodygraph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': row.value },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        console.error('[get_human_design] error:', res.status, JSON.stringify(json, null, 2))
        return { error: `HTTP ${res.status}`, details: json }
      }
      return json
    } catch (e: any) {
      console.error('[get_human_design] error:', e)
      return { error: String(e) }
    }
  },
})

export const getVedicChartTool = tool({
  description: 'Generate a Vedic (Jyotish) astrology chart using the sidereal zodiac.',
  inputSchema: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
    birthPlace: z.string().describe('City name, e.g. "Moscow"'),
    countryCode: z.string().describe('ISO 3166-1 alpha-2 country code, e.g. "RU", "US", "GB"'),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, countryCode, lat, lon }) => {
    try {
      const client = await getAstroClient()
      return await client.charts.getNatalChart({
        subject: buildSubject(birthDate, birthTime, birthPlace, countryCode, lat, lon),
        options: { zodiac_type: 'Sidereal' },
      })
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getChineseAstrologyTool = tool({
  description: 'Calculate Chinese astrology (BaZi / Four Pillars of Destiny) for a person.',
  inputSchema: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().optional().describe('Birth time in HH:MM format (optional)'),
  }),
  execute: async ({ birthDate, birthTime }) => {
    try {
      const client = await getAstroClient()
      const { year, month, day } = parseDateParts(birthDate)
      const timeParts = birthTime ? parseTimeParts(birthTime) : null
      return await client.chinese.calculateBaZi({
        subject: {
          name: 'Subject',
          birth_data: {
            year,
            month,
            day,
            hour: timeParts?.hour ?? 0,
            minute: timeParts?.minute ?? 0,
            second: 0,
          },
        },
        include_annual_pillars: false,
        language: 'ru',
        tradition: 'classical',
        analysis_depth: 'standard',
      })
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getSolarReturnTool = tool({
  description: 'Calculate the Solar Return chart — the chart for the moment the Sun returns to its natal position.',
  inputSchema: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
    birthPlace: z.string().describe('City name, e.g. "Moscow"'),
    countryCode: z.string().describe('ISO 3166-1 alpha-2 country code, e.g. "RU", "US", "GB"'),
    year: z.number().optional().describe('Year for the solar return (defaults to current year)'),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, countryCode, year, lat, lon }) => {
    try {
      const client = await getAstroClient()
      return await client.charts.getSolarReturnChart({
        subject: buildSubject(birthDate, birthTime, birthPlace, countryCode, lat, lon),
        return_year: year ?? new Date().getFullYear(),
      })
    } catch (e) {
      return { error: String(e) }
    }
  },
})

// ─── All Tools Export ──────────────────────────────────────────────────────────

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
