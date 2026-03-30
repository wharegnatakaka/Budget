import { createContext, useContext, useEffect, useState } from 'react'

export interface Theme {
  bg:           string
  surface:      string
  surfaceAlt:   string
  border:       string
  borderStrong: string
  text:         string
  textMuted:    string
  accent:       string
  danger:       string
  inputBorder:  string
  inputBg:      string
}

const light: Theme = {
  bg:           '#ffffff',
  surface:      '#f9fafb',
  surfaceAlt:   '#f0f9ff',
  border:       '#e5e7eb',
  borderStrong: '#d1d5db',
  text:         '#111827',
  textMuted:    '#6b7280',
  accent:       '#6366f1',
  danger:       '#ef4444',
  inputBorder:  '#d1d5db',
  inputBg:      '#ffffff',
}

const dark: Theme = {
  bg:           '#0f172a',
  surface:      '#1e293b',
  surfaceAlt:   '#172554',
  border:       '#334155',
  borderStrong: '#475569',
  text:         '#f1f5f9',
  textMuted:    '#94a3b8',
  accent:       '#818cf8',
  danger:       '#f87171',
  inputBorder:  '#475569',
  inputBg:      '#1e293b',
}

interface ThemeContextType {
  theme: Theme
  isDark: boolean
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextType>({ theme: light, isDark: false, toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    const t = isDark ? dark : light
    document.body.style.backgroundColor = t.bg
    document.body.style.color = t.text
    document.body.style.fontFamily = "'JetBrains Mono', monospace"
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <ThemeContext.Provider value={{ theme: isDark ? dark : light, isDark, toggle: () => setIsDark(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
