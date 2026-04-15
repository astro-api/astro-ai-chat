import ReactMarkdown from 'react-markdown'

interface MessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function Message({ role, content, isStreaming }: MessageProps) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className="max-w-[80%] rounded-2xl px-4 py-3 text-sm"
        style={isUser
          ? { background: '#585B65', color: '#e8e8e8' }
          : { background: '#1a1a1a', color: '#e8e8e8', border: '1px solid #2a2a2a' }
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="message-prose">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && <span className="animate-pulse">▋</span>}
          </div>
        )}
      </div>
    </div>
  )
}
