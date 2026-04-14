import { tool } from 'ai'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { db } from './db'
import { memory } from './db/schema'
import { getAstroClient } from './astro-client'

// ─── Helper: parse a "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" string into numeric parts ────

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
  parameters: z.object({
    key: z
      .string()
      .describe(
        'Short key for the fact, e.g. "birth_date", "birth_place", "name", "partner_birth_date"',
      ),
    value: z
      .string()
      .describe('The value to remember, e.g. "1990-05-15", "Moscow, Russia"'),
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
  parameters: z.object({}),
  execute: async () => {
    const rows = db.select().from(memory).all()
    return { memories: rows.map((r) => ({ key: r.key, value: r.value })) }
  },
})

// ─── Astrology Tools ───────────────────────────────────────────────────────────

export const getNatalChartTool = tool({
  description:
    'Generate a natal (birth) chart showing planetary positions, house cusps, and aspects for a given person.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
    birthPlace: z.string().describe('City/country of birth, e.g. "Moscow, Russia"'),
    lat: z.number().optional().describe('Latitude (optional, improves accuracy)'),
    lon: z.number().optional().describe('Longitude (optional, improves accuracy)'),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, lat, lon }) => {
    try {
      const client = await getAstroClient()
      const result = await client.charts.getNatalChart({
        subject: buildSubject(birthDate, birthTime, birthPlace, lat, lon),
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getTransitsTool = tool({
  description:
    'Calculate current or future planetary transits to a natal chart. Shows how current planetary positions affect the birth chart.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
    birthPlace: z.string().describe('City/country of birth'),
    transitDate: z
      .string()
      .optional()
      .describe('Date for transit calculation in YYYY-MM-DD format (defaults to today)'),
    lat: z.number().optional().describe('Latitude of birth place'),
    lon: z.number().optional().describe('Longitude of birth place'),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, transitDate, lat, lon }) => {
    try {
      const client = await getAstroClient()
      const today = new Date()
      const tDateStr = transitDate ?? today.toISOString().split('T')[0]
      const { year, month, day } = parseDateParts(tDateStr)
      const result = await client.charts.getTransitChart({
        natal_subject: buildSubject(birthDate, birthTime, birthPlace, lat, lon),
        transit_datetime: {
          year,
          month,
          day,
          hour: today.getHours(),
          minute: today.getMinutes(),
        },
      })
      return result
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
  description:
    'Calculate synastry (relationship compatibility) chart between two people by comparing their natal charts.',
  parameters: z.object({
    person1: personSchema.describe('Birth data for the first person'),
    person2: personSchema.describe('Birth data for the second person'),
  }),
  execute: async ({ person1, person2 }) => {
    try {
      const client = await getAstroClient()
      const result = await client.charts.getSynastryChart({
        subject1: buildSubject(person1.birthDate, person1.birthTime, person1.birthPlace, person1.lat, person1.lon),
        subject2: buildSubject(person2.birthDate, person2.birthTime, person2.birthPlace, person2.lat, person2.lon),
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getHoroscopeTool = tool({
  description:
    'Get a horoscope forecast for a zodiac sign for the specified time period.',
  parameters: z.object({
    sign: z
      .enum([
        'Aries',
        'Taurus',
        'Gemini',
        'Cancer',
        'Leo',
        'Virgo',
        'Libra',
        'Scorpio',
        'Sagittarius',
        'Capricorn',
        'Aquarius',
        'Pisces',
      ])
      .describe('Zodiac sign'),
    period: z
      .enum(['daily', 'weekly', 'monthly', 'yearly'])
      .default('daily')
      .describe('Time period for the horoscope'),
  }),
  execute: async ({ sign, period }) => {
    try {
      const client = await getAstroClient()
      if (period === 'daily') {
        return await client.horoscope.getSignDailyHoroscope({ sign })
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
  description:
    'Calculate core numerology numbers (Life Path, Expression, Soul Urge, etc.) for a person based on their name and birth date.',
  parameters: z.object({
    name: z.string().describe("The person's full name"),
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
  }),
  execute: async ({ name, birthDate }) => {
    try {
      const client = await getAstroClient()
      const { year, month, day } = parseDateParts(birthDate)
      const result = await client.numerology.getCoreNumbers({
        subject: {
          name,
          birth_data: { year, month, day },
        },
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getTarotReadingTool = tool({
  description:
    'Perform a tarot card reading with a chosen spread. Returns drawn cards with interpretations.',
  parameters: z.object({
    spread: z
      .enum(['single', 'three-card', 'celtic-cross'])
      .default('three-card')
      .describe('Type of tarot spread'),
    question: z.string().optional().describe('Optional question or topic for the reading'),
  }),
  execute: async ({ spread, question: _question }) => {
    try {
      const client = await getAstroClient()
      // Map spread type to card count and spread_type
      const spreadMap: Record<string, { count: number; spread_type: string }> = {
        single: { count: 1, spread_type: 'single' },
        'three-card': { count: 3, spread_type: 'three_card' },
        'celtic-cross': { count: 10, spread_type: 'celtic_cross' },
      }
      const { count, spread_type } = spreadMap[spread]

      if (spread === 'single') {
        return await client.tarot.generateSingleReport({
          cards: await client.tarot
            .drawCards({ count, exclude_reversed: false, include_annual_pillars: false } as any)
            .then((r: any) => r.cards ?? r.drawn_cards ?? []),
        } as any)
      } else if (spread === 'three-card') {
        const drawn = await client.tarot.drawCards({
          count,
          exclude_reversed: false,
          include_annual_pillars: false,
        } as any)
        return await client.tarot.generateThreeCardReport({ cards: (drawn as any).cards ?? (drawn as any).drawn_cards ?? [] } as any)
      } else {
        const drawn = await client.tarot.drawCards({
          count,
          exclude_reversed: false,
          include_annual_pillars: false,
        } as any)
        return await client.tarot.generateCelticCrossReport({ cards: (drawn as any).cards ?? (drawn as any).drawn_cards ?? [] } as any)
      }
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getHumanDesignTool = tool({
  description:
    'Generate a Human Design chart (bodygraph) for a person. Provides type, strategy, authority, profile, and defined/undefined centers.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h) — precision is critical for Human Design'),
    birthPlace: z.string().describe('City/country of birth'),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, lat, lon }) => {
    try {
      const client = await getAstroClient()
      // Human Design is not a dedicated client endpoint in the current library version.
      // Using the enhanced personal analysis as the closest available proxy.
      // TODO: verify if the library exposes a dedicated Human Design endpoint.
      const { year, month, day } = parseDateParts(birthDate)
      const { hour, minute } = parseTimeParts(birthTime)
      const result = await (client as any).enhanced.getPersonalAnalysis({
        subject: buildSubject(birthDate, birthTime, birthPlace, lat, lon),
        datetime: { year, month, day, hour, minute },
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getVedicChartTool = tool({
  description:
    'Generate a Vedic (Jyotish) astrology chart using the sidereal zodiac. Includes rasi chart, planetary positions, and nakshatras.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
    birthPlace: z.string().describe('City/country of birth'),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, lat, lon }) => {
    try {
      const client = await getAstroClient()
      // Vedic chart uses sidereal zodiac_type
      const result = await client.charts.getNatalChart({
        subject: buildSubject(birthDate, birthTime, birthPlace, lat, lon),
        options: { zodiac_type: 'Sidereal' },
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getChineseAstrologyTool = tool({
  description:
    'Calculate Chinese astrology (BaZi / Four Pillars of Destiny) for a person based on their birth date.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().optional().describe('Birth time in HH:MM format (optional, improves BaZi hour pillar)'),
  }),
  execute: async ({ birthDate, birthTime }) => {
    try {
      const client = await getAstroClient()
      const { year, month, day } = parseDateParts(birthDate)
      const timeParts = birthTime ? parseTimeParts(birthTime) : null
      const result = await client.chinese.calculateBaZi({
        subject: {
          name: 'Subject',
          birth_data: {
            year,
            month,
            day,
            ...(timeParts ? { hour: timeParts.hour } : {}),
          },
        },
        include_annual_pillars: false,
      })
      return result
    } catch (e) {
      return { error: String(e) }
    }
  },
})

export const getSolarReturnTool = tool({
  description:
    'Calculate the Solar Return chart for a given year — the chart for the moment the Sun returns to its exact natal position, marking the personal new year.',
  parameters: z.object({
    birthDate: z.string().describe('Birth date in YYYY-MM-DD format'),
    birthTime: z.string().describe('Birth time in HH:MM format (24h)'),
    birthPlace: z.string().describe('City/country of birth'),
    year: z
      .number()
      .optional()
      .describe('Year for the solar return (defaults to current year)'),
    lat: z.number().optional(),
    lon: z.number().optional(),
  }),
  execute: async ({ birthDate, birthTime, birthPlace, year, lat, lon }) => {
    try {
      const client = await getAstroClient()
      const returnYear = year ?? new Date().getFullYear()
      const result = await client.charts.getSolarReturnChart({
        subject: buildSubject(birthDate, birthTime, birthPlace, lat, lon),
        return_year: returnYear,
      })
      return result
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
