import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Message } from './Message'

type MessageData = { id: string; role: 'user' | 'assistant'; content: string }

interface MessageListProps {
  messages: MessageData[]
  streamingContent: string
  isStreaming: boolean
}

export function MessageList({ messages, streamingContent, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <ScrollArea className="flex-1 px-4 py-4">
      {messages.map((msg) => (
        <Message key={msg.id} role={msg.role} content={msg.content} />
      ))}
      {isStreaming && <Message role="assistant" content={streamingContent} isStreaming={true} />}
      <div ref={bottomRef} />
    </ScrollArea>
  )
}
