import { ElectronAPI } from '@electron-toolkit/preload'

export type ChatRecord = {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export type MessageRecord = {
  id: string
  chatId: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls: string | null
  createdAt: Date
}

export type MemoryRecord = {
  id: string
  key: string
  value: string
  updatedAt: Date
}

type ElectronAPIType = {
  createChat: () => Promise<ChatRecord>
  listChats: () => Promise<ChatRecord[]>
  getChat: (chatId: string) => Promise<MessageRecord[]>
  deleteChat: (chatId: string) => Promise<{ success: boolean }>
  renameChat: (chatId: string, title: string) => Promise<{ success: boolean }>
  sendMessage: (chatId: string, message: string) => Promise<{ success: boolean }>
  onStreamChunk: (cb: (data: { chatId: string; chunk: string }) => void) => () => void
  onStreamEnd: (cb: (data: { chatId: string }) => void) => () => void
  onStreamError: (cb: (data: { chatId: string; error: string }) => void) => () => void
  listMemory: () => Promise<MemoryRecord[]>
  deleteMemory: (key: string) => Promise<{ success: boolean }>
  getSettings: () => Promise<Record<string, string>>
  setSettings: (updates: Record<string, string>) => Promise<{ success: boolean }>
  listModels: (provider: string) => Promise<{ models: string[] }>
  setTitle: (title: string) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    electronAPI: ElectronAPIType
  }
}
