import { generateText } from 'ai'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { chats, messages } from './db/schema'
import { getModel } from './ai-model'

const MESSAGE_COUNT_THRESHOLD = 30
const TOKEN_THRESHOLD = 30_000
const KEEP_LAST = 10

type Message = typeof messages.$inferSelect

export function estimateTokens(msgs: Pick<Message, 'content'>[]): number {
  const totalChars = msgs.reduce((sum, m) => sum + m.content.length, 0)
  return Math.ceil(totalChars / 4)
}

const SUMMARIZER_SYSTEM_PROMPT = `You compress an astrology-chat transcript into a compact summary.

Produce EXACTLY this structure:

## Facts
- Structured bullets: user name, birth date/time/place, zodiac signs derived from their natal chart, partners/relationships discussed for compatibility, stated preferences or recurring themes.
- Omit any bullet whose fact is not present in the transcript. Do not invent.

## Conversation
A concise narrative (max 10 sentences) of what the user asked, what tools/reports were produced, and key insights the assistant shared. Preserve tone and any ongoing threads the next reply should continue.

Never restate the transcript verbatim. Never add facts not present.`

export async function maybeSummarize(chatId: string): Promise<void> {
  const all = db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(messages.createdAt)
    .all()

  if (all.length <= KEEP_LAST) return

  const exceedsCount = all.length > MESSAGE_COUNT_THRESHOLD
  const exceedsTokens = estimateTokens(all) > TOKEN_THRESHOLD
  if (!exceedsCount && !exceedsTokens) return

  const chatRow = db.select().from(chats).where(eq(chats.id, chatId)).get()
  if (!chatRow) return

  const toSummarize = all.slice(0, -KEEP_LAST)
  const newCutoffId = toSummarize[toSummarize.length - 1].id

  if (chatRow.summarizedUpToMessageId === newCutoffId) return

  const transcript = toSummarize
    .map((m) => `[${m.role}] ${m.content}`)
    .join('\n\n')

  console.log(`[summarize] triggered for chat ${chatId}: ${toSummarize.length} messages, ~${estimateTokens(toSummarize)} tokens`)

  const { text } = await generateText({
    model: getModel(),
    system: SUMMARIZER_SYSTEM_PROMPT,
    prompt: `Transcript to summarize:\n\n${transcript}`,
  })

  db.update(chats)
    .set({ summary: text, summarizedUpToMessageId: newCutoffId })
    .where(eq(chats.id, chatId))
    .run()

  console.log(`[summarize] stored summary for chat ${chatId} (${text.length} chars)`)
}
