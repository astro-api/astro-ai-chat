import { useState, useEffect, useCallback, useRef } from 'react'

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type Chat = {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export function useChat() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const streamingContentRef = useRef('')
  const [hasApiKeys, setHasApiKeys] = useState(true) // optimistic: assume configured

  const loadChats = useCallback(async () => {
    const list = await window.electronAPI.listChats()
    setChats(list as Chat[])
  }, [])

  const loadMessages = useCallback(async (chatId: string) => {
    const msgs = await window.electronAPI.getChat(chatId)
    setMessages(
      msgs.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    )
  }, [])

  // Subscribe to stream events
  useEffect(() => {
    const unsubChunk = window.electronAPI.onStreamChunk(({ chunk }) => {
      streamingContentRef.current += chunk
      setStreamingContent(streamingContentRef.current)
    })

    const unsubEnd = window.electronAPI.onStreamEnd(async ({ chatId }) => {
      setIsStreaming(false)
      streamingContentRef.current = ''
      setStreamingContent('')
      await loadMessages(chatId)
      await loadChats()
      // Update title in case chat was renamed after first message
      const chats = await window.electronAPI.listChats()
      const chat = chats.find(c => c.id === chatId)
      if (chat) window.electronAPI.setTitle(`Astro AI Chat — ${chat.title}`)
    })

    const unsubError = window.electronAPI.onStreamError(({ error }) => {
      setIsStreaming(false)
      streamingContentRef.current = ''
      setStreamingContent('')
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${error}` },
      ])
    })

    return () => {
      unsubChunk()
      unsubEnd()
      unsubError()
    }
  }, [loadMessages, loadChats])

  const createChat = useCallback(async () => {
    const chat = await window.electronAPI.createChat()
    await loadChats()
    setActiveChatId(chat.id)
    setMessages([])
    window.electronAPI.setTitle('Astro AI Chat — New Chat')
    return chat
  }, [loadChats])

  const selectChat = useCallback(
    async (chatId: string) => {
      setActiveChatId(chatId)
      await loadMessages(chatId)
      // Find chat title from current list
      const chats = await window.electronAPI.listChats()
      const chat = chats.find(c => c.id === chatId)
      if (chat) window.electronAPI.setTitle(`Astro AI Chat — ${chat.title}`)
    },
    [loadMessages],
  )

  const deleteChat = useCallback(
    async (chatId: string) => {
      await window.electronAPI.deleteChat(chatId)
      await loadChats()
      if (activeChatId === chatId) {
        setActiveChatId(null)
        setMessages([])
      }
    },
    [activeChatId, loadChats],
  )

  const renameChat = useCallback(
    async (chatId: string, title: string) => {
      await window.electronAPI.renameChat(chatId, title)
      await loadChats()
      if (activeChatId === chatId) {
        window.electronAPI.setTitle(`Astro AI Chat — ${title}`)
      }
    },
    [activeChatId, loadChats],
  )

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeChatId || isStreaming) return

      const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      streamingContentRef.current = ''
      setStreamingContent('')

      await window.electronAPI.sendMessage(activeChatId, content)
    },
    [activeChatId, isStreaming],
  )

  const recheckApiKeys = useCallback(() => {
    window.electronAPI.getSettings().then((s) => {
      const aiKeys = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'MISTRAL_API_KEY']
      const hasAI = aiKeys.some(k => s[k]?.trim())
      const hasAstro = !!s['ASTROLOGY_API_KEY']?.trim()
      setHasApiKeys(hasAI && hasAstro)
    })
  }, [])

  // Initial load
  useEffect(() => {
    loadChats()
    window.electronAPI.setTitle('Astro AI Chat')
    recheckApiKeys()
  }, [loadChats, recheckApiKeys])

  return {
    chats,
    activeChatId,
    messages,
    isStreaming,
    streamingContent,
    createChat,
    selectChat,
    deleteChat,
    renameChat,
    sendMessage,
    hasApiKeys,
    recheckApiKeys,
  }
}
