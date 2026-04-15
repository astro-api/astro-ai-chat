import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { useTr } from '../i18n/LanguageContext'

type Message = { id: string; role: 'user' | 'assistant'; content: string }

interface ChatProps {
  messages: Message[]
  streamingContent: string
  isStreaming: boolean
  onSend: (message: string) => void
  hasActiveChat: boolean
}

export function Chat({ messages, streamingContent, isStreaming, onSend, hasActiveChat }: ChatProps) {
  const { tr } = useTr()

  if (!hasActiveChat) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center" style={{ background: '#111111', color: '#585B65' }}>
        <p className="text-lg">{tr.selectOrCreate}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: '#111111' }}>
      <MessageList messages={messages} streamingContent={streamingContent} isStreaming={isStreaming} />
      <InputBar onSend={onSend} disabled={isStreaming} />
    </div>
  )
}
