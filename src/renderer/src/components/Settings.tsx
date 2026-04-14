import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'

interface SettingsProps {
  onClose: () => void
}

export function Settings({ onClose }: SettingsProps) {
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [astrologyKey, setAstrologyKey] = useState('')
  const [model, setModel] = useState('anthropic/claude-sonnet-4-5')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      setOpenrouterKey(s['OPENROUTER_API_KEY'] ?? '')
      setAstrologyKey(s['ASTROLOGY_API_KEY'] ?? '')
      setModel(s['model'] ?? 'anthropic/claude-sonnet-4-5')
    })
  }, [])

  const handleSave = async () => {
    await window.electronAPI.setSettings({ OPENROUTER_API_KEY: openrouterKey, ASTROLOGY_API_KEY: astrologyKey, model })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-[480px] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-semibold">Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-slate-300 text-sm mb-1 block">OpenRouter API Key</label>
            <Input type="password" value={openrouterKey} onChange={(e) => setOpenrouterKey(e.target.value)} placeholder="sk-or-..." className="bg-slate-800 border-slate-600 text-white" />
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Astrology API Key</label>
            <Input type="password" value={astrologyKey} onChange={(e) => setAstrologyKey(e.target.value)} placeholder="your-astrology-api-key" className="bg-slate-800 border-slate-600 text-white" />
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Model</label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="anthropic/claude-sonnet-4-5" className="bg-slate-800 border-slate-600 text-white" />
            <p className="text-slate-500 text-xs mt-1">Any model available on OpenRouter, e.g. openai/gpt-4o</p>
          </div>
        </div>
        <Button onClick={handleSave} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white">
          {saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
