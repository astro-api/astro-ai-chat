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
    return chat
  }, [loadChats])

  const selectChat = useCallback(
    async (chatId: string) => {
      setActiveChatId(chatId)
      await loadMessages(chatId)
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

  // Initial load
  useEffect(() => {
    loadChats()
  }, [loadChats])

  return {
    chats,
    activeChatId,
    messages,
    isStreaming,
    streamingContent,
    createChat,
    selectChat,
    deleteChat,
    sendMessage,
  }
}
