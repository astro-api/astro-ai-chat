import { useState, useEffect, useCallback } from 'react'
import t, { Language } from './translations'

const STORAGE_KEY = 'app_language'

function detectLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY) as Language | null
  if (saved) return saved
  const browser = navigator.language.slice(0, 2) as Language
  const supported: Language[] = ['en', 'ru', 'es', 'de', 'fr', 'pt', 'uk', 'tr']
  return supported.includes(browser) ? browser : 'en'
}

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>(detectLanguage)

  const setLanguage = useCallback((lang: Language) => {
    localStorage.setItem(STORAGE_KEY, lang)
    setLanguageState(lang)
  }, [])

  // Sync language with settings on first load
  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      const saved = s['language'] as Language | undefined
      if (saved) {
        setLanguageState(saved)
        localStorage.setItem(STORAGE_KEY, saved)
      }
    })
  }, [])

  const tr = t[language]

  return { language, setLanguage, tr }
}
