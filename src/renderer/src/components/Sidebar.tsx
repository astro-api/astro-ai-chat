import { Plus, Trash2, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

type Chat = { id: string; title: string }

interface SidebarProps {
  chats: Chat[]
  activeChatId: string | null
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onOpenSettings: () => void
}

export function Sidebar({ chats, activeChatId, onNewChat, onSelectChat, onDeleteChat, onOpenSettings }: SidebarProps) {
  return (
    <div className="flex flex-col w-64 h-full bg-slate-900 border-r border-slate-700">
      <div className="p-3">
        <Button onClick={onNewChat} className="w-full" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>

      <Separator className="bg-slate-700" />

      <ScrollArea className="flex-1 px-2 py-2">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`group flex items-center justify-between rounded-md px-3 py-2 mb-1 cursor-pointer text-sm transition-colors ${
              activeChatId === chat.id ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
            onClick={() => onSelectChat(chat.id)}
          >
            <span className="truncate flex-1">{chat.title}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400"
              onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id) }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </ScrollArea>

      <Separator className="bg-slate-700" />
      <div className="p-3">
        <Button onClick={onOpenSettings} variant="ghost" className="w-full text-slate-400 hover:text-white">
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </div>
    </div>
  )
}
