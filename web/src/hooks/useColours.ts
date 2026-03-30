import { useState } from 'react'

const STORAGE_KEY = 'donut-colours'

function load(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

export function useColours() {
  const [colours, setColours] = useState<Record<string, string>>(load)

  function setColour(key: string, hex: string) {
    const next = { ...colours, [key]: hex }
    setColours(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function getColour(key: string, fallback: string): string {
    return colours[key] ?? fallback
  }

  return { getColour, setColour }
}
