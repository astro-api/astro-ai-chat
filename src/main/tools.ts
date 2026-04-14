import { tool } from 'ai'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { db } from './db'
import { memory } from './db/schema'
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

function buildSubject(birthDate: string, birthTime: string, birthPlace: string, lat?: number, lon?: number) {
  const { year, month, day } = parseDateParts(birthDate)
  const { hour, minute } = parseTimeParts(birthTime)
  return {
    birth_data: {
      year,
      month,
      day,
      hour,
      minute,
      second: null as null,
      city: birthPlace,
      latitude: lat ?? null,
      longitude: lon ?? null,
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
    birthPlace: z.string().describe('City/country of birth, e.g. "Moscow, Russia"'),
    lat: z.number().optional().describe('Latitude (optional, improves accuracy)'),
    lon: z.number().optional().describe('Longitude (optional, improves accuracy)'),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, lat, lon }) => {
    try {
      const client = await getAstroClient()
      return await client.charts.getNatalChart({ subject: buildSubject(birthDate, birthTime, birthPlace, lat, lon) })
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getTransitsTool = tool({
  description:
    'Calculate current or future planetary transits to a natal chart. Shows how current planetary positions affect the birth chart.',
  inputSchema: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
    birthPlace: z.string().describe('City/country of birth'),
    transitDate: z.string().optional().describe('Date for transit calculation in YYYY-MM-DD format (defaults to today)'),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, transitDate, lat, lon }) => {
    try {
      const client = await getAstroClient()
      const today = new Date()
      const tDateStr = transitDate ?? today.toISOString().split('T')[0]
      const { year, month, day } = parseDateParts(tDateStr)
      return await client.charts.getTransitChart({
        natal_subject: buildSubject(birthDate, birthTime, birthPlace, lat, lon),
        transit_datetime: { year, month, day, hour: today.getHours(), minute: today.getMinutes() },
      })
    } catch (e) {
      return { error: String(e) }
    }
  },
})

const personSchema = z.object({
  birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
  birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
  birthPlace: z.string().describe('City/country of birth'),
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
        subject1: buildSubject(person1.birthDate, person1.birthTime, person1.birthPlace, person1.lat, person1.lon),
        subject2: buildSubject(person2.birthDate, person2.birthTime, person2.birthPlace, person2.lat, person2.lon),
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
        subject: { name, birth_data: { year, month, day, hour: null, minute: null, second: null } },
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
  execute: async ({ spread }) => {
    try {
      const client = await getAstroClient()
      const countMap = { single: 1, 'three-card': 3, 'celtic-cross': 10 }
      const drawn = await client.tarot.drawCards({ count: countMap[spread] } as any)
      const cards = (drawn as any).cards ?? (drawn as any).drawn_cards ?? []
      if (spread === 'single') {
        return await client.tarot.generateSingleReport({ cards } as any)
      } else if (spread === 'three-card') {
        return await client.tarot.generateThreeCardReport({ cards } as any)
      } else {
        return await client.tarot.generateCelticCrossReport({ cards } as any)
      }
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getHumanDesignTool = tool({
  description: 'Get Human Design analysis for a person (type, strategy, authority, profile).',
  inputSchema: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM (precision is critical for Human Design)'),
    birthPlace: z.string().describe('City/country of birth'),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, lat, lon }) => {
    try {
      const client = await getAstroClient()
      // Human Design not dedicated — using enhanced personal analysis as proxy
      return await (client as any).enhanced.getPersonalAnalysis({
        subject: buildSubject(birthDate, birthTime, birthPlace, lat, lon),
      })
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getVedicChartTool = tool({
  description: 'Generate a Vedic (Jyotish) astrology chart using the sidereal zodiac.',
  inputSchema: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
    birthPlace: z.string().describe('City/country of birth'),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, lat, lon }) => {
    try {
      const client = await getAstroClient()
      return await client.charts.getNatalChart({
        subject: buildSubject(birthDate, birthTime, birthPlace, lat, lon),
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
            hour: timeParts?.hour ?? null,
            minute: timeParts?.minute ?? null,
            second: null,
          },
        },
        include_annual_pillars: false,
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
    birthPlace: z.string().describe('City/country of birth'),
    year: z.number().optional().describe('Year for the solar return (defaults to current year)'),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, year, lat, lon }) => {
    try {
      const client = await getAstroClient()
      return await client.charts.getSolarReturnChart({
        subject: buildSubject(birthDate, birthTime, birthPlace, lat, lon),
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
