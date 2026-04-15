import { useState, KeyboardEvent } from 'react'
import { SendHorizontal } from 'lucide-react'
import { useTr } from '../i18n/LanguageContext'

interface InputBarProps {
  onSend: (message: string) => void
  disabled: boolean
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [value, setValue] = useState('')
  const { tr } = useTr()

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex items-end gap-2 p-4" style={{ borderTop: '1px solid #2a2a2a', background: '#111111' }}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tr.inputPlaceholder}
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none"
        style={{
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          color: '#e8e8e8',
          minHeight: '48px',
          maxHeight: '200px',
        }}
        onInput={(e) => {
          const el = e.currentTarget
          el.style.height = 'auto'
          el.style.height = Math.min(el.scrollHeight, 200) + 'px'
        }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="flex items-center justify-center rounded-xl transition-colors"
        style={{
          width: '48px',
          height: '48px',
          background: disabled || !value.trim() ? '#2a2a2a' : '#585B65',
          color: disabled || !value.trim() ? '#585B65' : '#e8e8e8',
          flexShrink: 0,
        }}
        onMouseEnter={e => { if (!disabled && value.trim()) e.currentTarget.style.background = '#6e7180' }}
        onMouseLeave={e => { if (!disabled && value.trim()) e.currentTarget.style.background = '#585B65' }}
      >
        <SendHorizontal className="h-5 w-5" />
      </button>
    </div>
  )
}
