import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Settings, Pencil, Check, X } from 'lucide-react'
import { useTr } from '../i18n/LanguageContext'

type Chat = { id: string; title: string }

interface SidebarProps {
  chats: Chat[]
  activeChatId: string | null
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onRenameChat: (id: string, title: string) => void
  onOpenSettings: () => void
}

export function Sidebar({ chats, activeChatId, onNewChat, onSelectChat, onDeleteChat, onRenameChat, onOpenSettings }: SidebarProps) {
  const { tr } = useTr()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.focus()
  }, [editingId])

  const startEdit = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(chat.id)
    setEditValue(chat.title)
  }

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRenameChat(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') cancelEdit()
  }

  return (
    <div className="flex flex-col w-64 h-full shrink-0" style={{ background: '#1a1a1a', borderRight: '1px solid #2a2a2a' }}>
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors"
          style={{ background: '#222222', color: '#8B8D98', border: '1px solid #2a2a2a' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e8e8e8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#8B8D98')}
        >
          <Plus className="h-4 w-4" />
          {tr.newChat}
        </button>
      </div>

      <div style={{ height: '1px', background: '#2a2a2a' }} />

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {chats.map((chat) => {
          const isActive = activeChatId === chat.id
          const isEditing = editingId === chat.id

          return (
            <div
              key={chat.id}
              className="flex items-center rounded-md px-2 py-2 mb-1 cursor-pointer text-sm transition-colors group"
              style={{
                background: isActive ? '#2a2a2a' : 'transparent',
                color: isActive ? '#e8e8e8' : '#8B8D98',
              }}
              onClick={() => !isEditing && onSelectChat(chat.id)}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#222222' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              {isEditing ? (
                <>
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 min-w-0 text-sm bg-transparent outline-none border-b"
                    style={{ color: '#e8e8e8', borderColor: '#585B65' }}
                  />
                  <button
                    onClick={e => { e.stopPropagation(); commitEdit() }}
                    className="shrink-0 ml-1 p-1 rounded"
                    style={{ color: '#4ade80' }}
                    title="Save"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); cancelEdit() }}
                    className="shrink-0 p-1 rounded"
                    style={{ color: '#585B65' }}
                    title="Cancel"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <>
                  <span className="truncate flex-1 mr-1">{chat.title}</span>
                  <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1 rounded"
                      style={{ color: '#585B65' }}
                      title={tr.renameChat}
                      onMouseEnter={e => (e.currentTarget.style.color = '#a5b4fc')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#585B65')}
                      onClick={e => startEdit(chat, e)}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      className="p-1 rounded"
                      style={{ color: '#585B65' }}
                      title={tr.deleteConfirm(chat.title)}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#585B65')}
                      onClick={e => {
                        e.stopPropagation()
                        if (window.confirm(tr.deleteConfirm(chat.title))) onDeleteChat(chat.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ height: '1px', background: '#2a2a2a' }} />
      <div className="p-3">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors"
          style={{ color: '#8B8D98' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e8e8e8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#8B8D98')}
        >
          <Settings className="h-4 w-4" />
          {tr.settings}
        </button>
      </div>
    </div>
  )
}
