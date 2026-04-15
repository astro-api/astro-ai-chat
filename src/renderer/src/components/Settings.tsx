import { useState, useEffect, useRef } from 'react'
import { X, ChevronDown, Search, RefreshCw, Globe } from 'lucide-react'
import { useTr } from '../i18n/LanguageContext'
import { LANGUAGES, Language } from '../i18n/translations'

interface SettingsProps {
  onClose: () => void
}

const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter', keyName: 'OPENROUTER_API_KEY', placeholder: 'sk-or-...', defaultModel: 'anthropic/claude-sonnet-4-5' },
  { id: 'anthropic',  label: 'Anthropic',  keyName: 'ANTHROPIC_API_KEY',  placeholder: 'sk-ant-...', defaultModel: 'claude-sonnet-4-6' },
  { id: 'openai',     label: 'OpenAI',     keyName: 'OPENAI_API_KEY',     placeholder: 'sk-...', defaultModel: 'gpt-4o' },
  { id: 'google',     label: 'Google',     keyName: 'GOOGLE_API_KEY',     placeholder: 'AIza...', defaultModel: 'gemini-2.0-flash' },
  { id: 'mistral',    label: 'Mistral',    keyName: 'MISTRAL_API_KEY',    placeholder: '...', defaultModel: 'mistral-large-latest' },
]

export function Settings({ onClose }: SettingsProps) {
  const { tr, language, setLanguage } = useTr()

  const [provider, setProvider] = useState('openrouter')
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [model, setModel] = useState('')
  const [astrologyKey, setAstrologyKey] = useState('')
  const [saveError, setSaveError] = useState(false)
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const langMenuRef = useRef<HTMLDivElement>(null)

  const currentProvider = PROVIDERS.find(p => p.id === provider) ?? PROVIDERS[0]
  const filteredModels = models.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()))
  const currentLang = LANGUAGES.find(l => l.id === language) ?? LANGUAGES[0]

  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      const savedProvider = s['provider'] ?? 'openrouter'
      setProvider(savedProvider)
      setModel(s['model'] ?? PROVIDERS.find(p => p.id === savedProvider)?.defaultModel ?? '')
      setAstrologyKey(s['ASTROLOGY_API_KEY'] ?? '')
      const keys: Record<string, string> = {}
      for (const p of PROVIDERS) keys[p.keyName] = s[p.keyName] ?? ''
      setApiKeys(keys)
    })
  }, [])

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false)
      }
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadModels = async (p = provider) => {
    setModelsLoading(true)
    setModels([])
    try {
      const { models: list } = await window.electronAPI.listModels(p)
      setModels(list)
    } finally {
      setModelsLoading(false)
    }
  }

  const handleProviderChange = (id: string) => {
    setProvider(id)
    setShowProviderMenu(false)
    setModels([])
    setModelSearch('')
    const p = PROVIDERS.find(p => p.id === id)!
    setModel(p.defaultModel)
  }

  const handleLangChange = (lang: Language) => {
    setLanguage(lang)
    setShowLangMenu(false)
  }

  const handleSave = async () => {
    const updates: Record<string, string> = { provider, model, ASTROLOGY_API_KEY: astrologyKey, language }
    for (const p of PROVIDERS) {
      if (apiKeys[p.keyName]) updates[p.keyName] = apiKeys[p.keyName]
    }
    try {
      await window.electronAPI.setSettings(updates)
      onClose()
    } catch {
      setSaveError(true)
      setTimeout(() => setSaveError(false), 3000)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: '#111111', border: '1px solid #2a2a2a', color: '#e8e8e8',
    borderRadius: '8px', padding: '8px 12px', width: '100%', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { color: '#8B8D98', fontSize: '13px', display: 'block', marginBottom: '4px' }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-xl p-6 w-[500px] space-y-4" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: '#e8e8e8' }}>{tr.settingsTitle}</h2>
          <button onClick={onClose} className="p-1 rounded" style={{ color: '#585B65' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e8e8e8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#585B65')}
          ><X className="h-4 w-4" /></button>
        </div>

        {/* Language */}
        <div>
          <label style={labelStyle}>
            <Globe className="inline h-3 w-3 mr-1 mb-0.5" />
            {tr.language}
          </label>
          <div className="relative" ref={langMenuRef}>
            <button onClick={() => setShowLangMenu(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm"
              style={{ background: '#111111', border: '1px solid #2a2a2a', color: '#e8e8e8' }}
            >
              <span>{currentLang.nativeLabel}</span>
              <ChevronDown className="h-4 w-4" style={{ color: '#585B65' }} />
            </button>
            {showLangMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-20"
                style={{ background: '#222222', border: '1px solid #2a2a2a' }}>
                {LANGUAGES.map(l => (
                  <button key={l.id} onClick={() => handleLangChange(l.id)}
                    className="w-full text-left px-3 py-2 text-sm"
                    style={{ color: l.id === language ? '#e8e8e8' : '#8B8D98', background: l.id === language ? '#2a2a2a' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
                    onMouseLeave={e => (e.currentTarget.style.background = l.id === language ? '#2a2a2a' : 'transparent')}
                  >
                    <span style={{ color: '#e8e8e8' }}>{l.nativeLabel}</span>
                    <span className="ml-2 text-xs" style={{ color: '#585B65' }}>{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ height: '1px', background: '#2a2a2a' }} />

        {/* Provider */}
        <div>
          <label style={labelStyle}>{tr.aiProvider}</label>
          <div className="relative">
            <button onClick={() => setShowProviderMenu(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm"
              style={{ background: '#111111', border: '1px solid #2a2a2a', color: '#e8e8e8' }}
            >
              <span>{currentProvider.label}</span>
              <ChevronDown className="h-4 w-4" style={{ color: '#585B65' }} />
            </button>
            {showProviderMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-20"
                style={{ background: '#222222', border: '1px solid #2a2a2a' }}>
                {PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => handleProviderChange(p.id)}
                    className="w-full text-left px-3 py-2 text-sm"
                    style={{ color: p.id === provider ? '#e8e8e8' : '#8B8D98', background: p.id === provider ? '#2a2a2a' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
                    onMouseLeave={e => (e.currentTarget.style.background = p.id === provider ? '#2a2a2a' : 'transparent')}
                  >{p.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* API Key */}
        <div>
          <label style={labelStyle}>{currentProvider.label} {tr.apiKey}</label>
          <input type="password"
            value={apiKeys[currentProvider.keyName] ?? ''}
            onChange={e => setApiKeys(prev => ({ ...prev, [currentProvider.keyName]: e.target.value }))}
            placeholder={currentProvider.placeholder}
            style={inputStyle}
          />
        </div>

        {/* Model selector with search */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label style={labelStyle}>{tr.model}</label>
            <button onClick={() => loadModels()} disabled={modelsLoading}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{ color: '#585B65', background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#e8e8e8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#585B65')}
            >
              <RefreshCw className={`h-3 w-3 ${modelsLoading ? 'animate-spin' : ''}`} />
              {modelsLoading ? tr.loadingModels : tr.loadModels}
            </button>
          </div>

          <div className="relative" ref={modelMenuRef}>
            <button onClick={() => { setShowModelMenu(v => !v); if (!models.length) loadModels() }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm"
              style={{ background: '#111111', border: '1px solid #2a2a2a', color: '#e8e8e8' }}
            >
              <span className="truncate">{model || currentProvider.defaultModel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 ml-2" style={{ color: '#585B65' }} />
            </button>

            {showModelMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg z-20 flex flex-col"
                style={{ background: '#222222', border: '1px solid #2a2a2a', maxHeight: '240px' }}>
                {/* Search */}
                <div className="flex items-center px-3 py-2" style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <Search className="h-3 w-3 mr-2 shrink-0" style={{ color: '#585B65' }} />
                  <input autoFocus value={modelSearch} onChange={e => setModelSearch(e.target.value)}
                    placeholder={tr.searchModel}
                    className="flex-1 text-sm bg-transparent outline-none"
                    style={{ color: '#e8e8e8' }}
                  />
                </div>
                {/* List */}
                <div className="overflow-y-auto">
                  {modelsLoading && (
                    <div className="px-3 py-3 text-sm text-center" style={{ color: '#585B65' }}>{tr.loadingModels}</div>
                  )}
                  {!modelsLoading && filteredModels.length === 0 && (
                    <div className="px-3 py-3 text-sm text-center" style={{ color: '#585B65' }}>
                      {models.length === 0 ? tr.noModelsLoaded : tr.noModelsFound}
                    </div>
                  )}
                  {filteredModels.map(m => (
                    <button key={m} onClick={() => { setModel(m); setShowModelMenu(false); setModelSearch('') }}
                      className="w-full text-left px-3 py-2 text-sm truncate"
                      style={{ color: m === model ? '#e8e8e8' : '#8B8D98', background: m === model ? '#2a2a2a' : 'transparent' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
                      onMouseLeave={e => (e.currentTarget.style.background = m === model ? '#2a2a2a' : 'transparent')}
                    >{m}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ height: '1px', background: '#2a2a2a' }} />

        {/* Astrology API Key */}
        <div>
          <label style={labelStyle}>{tr.astrologyApiKey}</label>
          <input type="password" value={astrologyKey}
            onChange={e => setAstrologyKey(e.target.value)}
            placeholder="ask_..." style={inputStyle}
          />
        </div>

        <button onClick={handleSave}
          className="w-full py-2 rounded-lg text-sm font-medium"
          style={{ background: '#585B65', color: '#e8e8e8' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#6e7180')}
          onMouseLeave={e => (e.currentTarget.style.background = '#585B65')}
        >
          {saveError ? '⚠ Error' : tr.save}
        </button>
      </div>
    </div>
  )
}
