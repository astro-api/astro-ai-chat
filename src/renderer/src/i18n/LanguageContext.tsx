import { createContext, useContext, ReactNode } from 'react'
import { useLanguage } from './useLanguage'
import { Language, Translations } from './translations'

type LanguageContextType = {
  language: Language
  setLanguage: (lang: Language) => void
  tr: Translations
}

const LanguageContext = createContext<LanguageContextType | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const value = useLanguage()
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useTr() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTr must be used within LanguageProvider')
  return ctx
}
