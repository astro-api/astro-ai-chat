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
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
        isUser ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100 border border-slate-700'
      }`}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && <span className="animate-pulse">▋</span>}
          </div>
        )}
      </div>
    </div>
  )
}
