import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Chat } from './components/Chat'
import { Settings } from './components/Settings'
import { useChat } from './hooks/useChat'

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  const { chats, activeChatId, messages, isStreaming, streamingContent, createChat, selectChat, deleteChat, sendMessage } = useChat()

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onNewChat={createChat}
        onSelectChat={selectChat}
        onDeleteChat={deleteChat}
        onOpenSettings={() => setShowSettings(true)}
      />
      <Chat
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        onSend={sendMessage}
        hasActiveChat={activeChatId !== null}
      />
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}
