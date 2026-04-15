import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { useTr } from '../i18n/LanguageContext'
import { Settings as SettingsIcon, Key } from 'lucide-react'

type Message = { id: string; role: 'user' | 'assistant'; content: string }

interface ChatProps {
  messages: Message[]
  streamingContent: string
  isStreaming: boolean
  onSend: (message: string) => void
  hasActiveChat: boolean
  hasApiKeys: boolean
  onOpenSettings: () => void
}

export function Chat({
  messages, streamingContent, isStreaming, onSend,
  hasActiveChat, hasApiKeys, onOpenSettings,
}: ChatProps) {
  const { tr } = useTr()

  if (!hasApiKeys) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-6"
        style={{ background: '#111111' }}>
        <div className="rounded-xl p-8 max-w-md w-full mx-4 flex flex-col gap-4"
          style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <div className="flex items-center gap-3">
            <Key className="h-6 w-6 shrink-0" style={{ color: '#8b5cf6' }} />
            <h2 className="text-lg font-semibold" style={{ color: '#e8e8e8' }}>
              {tr.setupTitle}
            </h2>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: '#8B8D98' }}>
            {tr.setupDescription}
          </p>
          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: '#8b5cf6', color: '#ffffff' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#7c3aed')}
            onMouseLeave={e => (e.currentTarget.style.background = '#8b5cf6')}
          >
            <SettingsIcon className="h-4 w-4" />
            {tr.setupOpenSettings}
          </button>
        </div>
      </div>
    )
  }

  if (!hasActiveChat) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center"
        style={{ background: '#111111', color: '#585B65' }}>
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
