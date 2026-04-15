import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Chat } from './components/Chat'
import { Settings } from './components/Settings'
import { useChat } from './hooks/useChat'
import { LanguageProvider } from './i18n/LanguageContext'

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  const { chats, activeChatId, messages, isStreaming, streamingContent, createChat, selectChat, deleteChat, renameChat, sendMessage, hasApiKeys, recheckApiKeys } = useChat()

  return (
    <LanguageProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: '#111111', color: '#e8e8e8' }}>
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onNewChat={createChat}
          onSelectChat={selectChat}
          onDeleteChat={deleteChat}
          onRenameChat={renameChat}
          onOpenSettings={() => setShowSettings(true)}
        />
        <Chat
          messages={messages}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
          onSend={sendMessage}
          hasActiveChat={activeChatId !== null}
          hasApiKeys={hasApiKeys}
          onOpenSettings={() => setShowSettings(true)}
        />
        {showSettings && <Settings onClose={() => { setShowSettings(false); recheckApiKeys() }} />}
      </div>
    </LanguageProvider>
  )
}
