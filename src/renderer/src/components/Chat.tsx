import { MessageList } from './MessageList'
import { InputBar } from './InputBar'

type Message = { id: string; role: 'user' | 'assistant'; content: string }

interface ChatProps {
  messages: Message[]
  streamingContent: string
  isStreaming: boolean
  onSend: (message: string) => void
  hasActiveChat: boolean
}

export function Chat({ messages, streamingContent, isStreaming, onSend, hasActiveChat }: ChatProps) {
  if (!hasActiveChat) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-slate-950 text-slate-500">
        <p className="text-lg">Select a chat or create a new one</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col flex-1 bg-slate-950 overflow-hidden">
      <MessageList messages={messages} streamingContent={streamingContent} isStreaming={isStreaming} />
      <InputBar onSend={onSend} disabled={isStreaming} />
    </div>
  )
}
