import { contextBridge, ipcRenderer } from 'electron'

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

const api = {
  // Chats
  createChat: () => ipcRenderer.invoke('chat:create') as Promise<ChatRecord>,
  listChats: () => ipcRenderer.invoke('chat:list') as Promise<ChatRecord[]>,
  getChat: (chatId: string) => ipcRenderer.invoke('chat:get', chatId) as Promise<MessageRecord[]>,
  deleteChat: (chatId: string) => ipcRenderer.invoke('chat:delete', chatId) as Promise<{ success: boolean }>,
  renameChat: (chatId: string, title: string) => ipcRenderer.invoke('chat:rename', { chatId, title }) as Promise<{ success: boolean }>,

  // Messaging
  sendMessage: (chatId: string, message: string) =>
    ipcRenderer.invoke('chat:send', { chatId, message }) as Promise<{ success: boolean }>,

  // Stream events — returns cleanup function
  onStreamChunk: (cb: (data: { chatId: string; chunk: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { chatId: string; chunk: string }) => cb(data)
    ipcRenderer.on('chat:stream-chunk', handler)
    return () => ipcRenderer.removeListener('chat:stream-chunk', handler)
  },
  onStreamEnd: (cb: (data: { chatId: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { chatId: string }) => cb(data)
    ipcRenderer.on('chat:stream-end', handler)
    return () => ipcRenderer.removeListener('chat:stream-end', handler)
  },
  onStreamError: (cb: (data: { chatId: string; error: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { chatId: string; error: string }) => cb(data)
    ipcRenderer.on('chat:stream-error', handler)
    return () => ipcRenderer.removeListener('chat:stream-error', handler)
  },

  // Memory
  listMemory: () => ipcRenderer.invoke('memory:list') as Promise<MemoryRecord[]>,
  deleteMemory: (key: string) => ipcRenderer.invoke('memory:delete', key) as Promise<{ success: boolean }>,

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Record<string, string>>,
  setSettings: (updates: Record<string, string>) =>
    ipcRenderer.invoke('settings:set', updates) as Promise<{ success: boolean }>,

  // Models
  listModels: (provider: string) =>
    ipcRenderer.invoke('models:list', provider) as Promise<{ models: string[] }>,

  // Window
  setTitle: (title: string) => ipcRenderer.invoke('window:set-title', title),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) as Promise<void>,
}

contextBridge.exposeInMainWorld('electronAPI', api)

declare global {
  interface Window {
    electronAPI: typeof api
  }
}
