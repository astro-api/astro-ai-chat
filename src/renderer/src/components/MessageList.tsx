import { useEffect, useRef } from 'react'
import { Message } from './Message'

type MessageData = { id: string; role: 'user' | 'assistant'; content: string }

interface MessageListProps {
  messages: MessageData[]
  streamingContent: string
  isStreaming: boolean
}

export function MessageList({ messages, streamingContent, isStreaming }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streamingContent])

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <Message key={msg.id} role={msg.role} content={msg.content} />
      ))}
      {isStreaming && <Message role="assistant" content={streamingContent} isStreaming={true} />}
    </div>
  )
}
