import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../context/ThemeContext'

// Material Design 200-level palette
const SWATCHES = [
  '#ef9a9a', '#f48fb1', '#ce93d8', '#b39ddb',
  '#9fa8da', '#90caf9', '#81d4fa', '#80deea',
  '#80cbc4', '#a5d6a7', '#c5e1a5', '#e6ee9c',
  '#fff59d', '#ffe082', '#ffcc80', '#ffab91',
  '#bcaaa4', '#b0bec5',
]

interface Props {
  colour: string
  onChange: (hex: string) => void
  onClose: () => void
  anchor: { x: number; y: number }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
}

export default function ColourPicker({ colour, onChange, onClose, anchor }: Props) {
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const [rgb, setRgb] = useState<[number, number, number]>(hexToRgb(colour))

  useEffect(() => { setRgb(hexToRgb(colour)) }, [colour])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function selectSwatch(hex: string) {
    setRgb(hexToRgb(hex))
    onChange(hex)
  }

  function updateChannel(i: 0 | 1 | 2, val: string) {
    const n = Math.max(0, Math.min(255, parseInt(val) || 0))
    const next: [number, number, number] = [...rgb] as [number, number, number]
    next[i] = n
    setRgb(next)
    onChange(rgbToHex(...next))
  }

  const currentHex = rgbToHex(...rgb)

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: anchor.y,
        left: anchor.x,
        zIndex: 1000,
        background: theme.surface,
        border: `1px solid ${theme.borderStrong}`,
        borderRadius: 8,
        padding: '0.75rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        width: 200,
      }}
    >
      {/* Swatch grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginBottom: '0.6rem' }}>
        {SWATCHES.map(hex => (
          <div
            key={hex}
            onClick={() => selectSwatch(hex)}
            style={{
              width: '100%', aspectRatio: '1', borderRadius: 4,
              background: hex, cursor: 'pointer',
              outline: currentHex === hex ? `2px solid ${theme.text}` : '2px solid transparent',
              outlineOffset: 1,
            }}
          />
        ))}
      </div>

      {/* Preview + RGB inputs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: 28, height: 28, borderRadius: 4, background: currentHex, flexShrink: 0, border: `1px solid ${theme.borderStrong}` }} />
        {(['R', 'G', 'B'] as const).map((label, i) => (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: '0.6rem', color: theme.textMuted }}>{label}</span>
            <input
              type="number"
              min={0} max={255}
              value={rgb[i]}
              onChange={e => updateChannel(i as 0 | 1 | 2, e.target.value)}
              style={{
                width: '100%', textAlign: 'center',
                background: theme.inputBg, color: theme.text,
                border: `1px solid ${theme.inputBorder}`, borderRadius: 4,
                fontSize: '0.7rem', padding: '0.15rem 0',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
