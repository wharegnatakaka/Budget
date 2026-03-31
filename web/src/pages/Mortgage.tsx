import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useTheme } from '../context/ThemeContext'

interface Mortgage {
  id: number
  label: string | null
  original_principal: string
  current_balance: string | null
  balance_date: string | null
}

const fmt = (v: string | number | null | undefined) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtPct = (v: number | null) =>
  v == null ? '—' : `${v.toFixed(2)}%`

export default function MortgagePage() {
  const { theme } = useTheme()
  const [mortgages, setMortgages]         = useState<Mortgage[]>([])
  const [propertyValue, setPropertyValue] = useState<string>('')
  const [editingValue, setEditingValue]   = useState<string>('')
  const [editing, setEditing]             = useState(false)
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<Mortgage[]>('/mortgages'),
      api.get<{ key: string; value: string | null }>('/settings/property_value'),
    ]).then(([ms, setting]) => {
      setMortgages(ms)
      setPropertyValue(setting.value ?? '')
    }).finally(() => setLoading(false))
  }, [])

  async function savePropertyValue() {
    await api.patch('/settings/property_value', { setting: { value: editingValue } })
    setPropertyValue(editingValue)
    setEditing(false)
  }

  const totalBalance = mortgages.reduce((sum, m) => sum + (m.current_balance ? Number(m.current_balance) : 0), 0)
  const propVal      = propertyValue ? Number(propertyValue) : null
  const totalDebt    = Math.abs(totalBalance)
  const equity       = propVal != null ? propVal - totalDebt : null
  const equityPct    = propVal != null && propVal > 0 ? (equity! / propVal) * 100 : null

  const th: React.CSSProperties = {
    padding: '0.4rem 0.75rem',
    borderBottom: `2px solid ${theme.border}`,
    textAlign: 'left',
    fontSize: '0.875rem',
    color: theme.textMuted,
    fontWeight: 500,
  }
  const thR  = { ...th, textAlign: 'right' as const }
  const td: React.CSSProperties = {
    padding: '0.4rem 0.75rem',
    borderBottom: `1px solid ${theme.border}`,
    fontSize: '0.875rem',
    color: theme.text,
  }
  const tdR    = { ...td, textAlign: 'right' as const }
  const tdMuted = { ...td, color: theme.textMuted }

  if (loading) return <p style={{ color: theme.textMuted }}>Loading…</p>

  return (
    <div style={{ maxWidth: 600, color: theme.text }}>
      <h1 style={{ margin: '0 0 1.5rem' }}>Mortgage</h1>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Account</th>
            <th style={thR}>Balance</th>
            <th style={thR}>% of value</th>
            <th style={{ ...th, fontSize: '0.75rem' }}>As of</th>
          </tr>
        </thead>
        <tbody>
          {mortgages.map(m => {
            const bal    = m.current_balance ? Number(m.current_balance) : null
            const pct    = propVal && bal != null ? (Math.abs(bal) / propVal) * 100 : null
            return (
              <tr key={m.id}>
                <td style={td}>{m.label ?? 'Mortgage'}</td>
                <td style={tdR}>{fmt(bal)}</td>
                <td style={{ ...tdR, color: theme.textMuted }}>{fmtPct(pct)}</td>
                <td style={{ ...tdMuted, fontSize: '0.75rem' }}>{m.balance_date ?? '—'}</td>
              </tr>
            )
          })}

          <tr>
            <td style={{ ...td, borderTop: `1px solid ${theme.borderStrong}` }}>House valuation</td>
            <td style={{ ...tdR, borderTop: `1px solid ${theme.borderStrong}` }} colSpan={2}>
              {editing ? (
                <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                  <input
                    type="number"
                    value={editingValue}
                    onChange={e => setEditingValue(e.target.value)}
                    autoFocus
                    style={{
                      width: 120, textAlign: 'right',
                      background: theme.inputBg, color: theme.text,
                      border: `1px solid ${theme.inputBorder}`, borderRadius: 4,
                      fontSize: '0.875rem', padding: '0.1rem 0.3rem',
                    }}
                  />
                  <button onClick={savePropertyValue} style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', cursor: 'pointer', background: theme.accent, color: '#fff', border: 'none', borderRadius: 4 }}>Save</button>
                  <button onClick={() => setEditing(false)} style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', cursor: 'pointer', background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 4 }}>✕</button>
                </span>
              ) : (
                <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                  {fmt(propertyValue || null)}
                  <button onClick={() => { setEditingValue(propertyValue); setEditing(true) }} style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', cursor: 'pointer', background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 4 }}>Edit</button>
                </span>
              )}
            </td>
            <td style={{ ...tdMuted, borderTop: `1px solid ${theme.borderStrong}` }} />
          </tr>

          <tr style={{ background: theme.surface }}>
            <td style={{ ...td, fontWeight: 600, borderTop: `2px solid ${theme.border}` }}>Equity</td>
            <td style={{ ...tdR, fontWeight: 600, borderTop: `2px solid ${theme.border}`, color: equity != null && equity > 0 ? '#10b981' : theme.danger }}>
              {fmt(equity)}
            </td>
            <td style={{ ...tdR, fontWeight: 600, borderTop: `2px solid ${theme.border}`, color: equityPct != null && equityPct > 0 ? '#10b981' : theme.danger }}>
              {fmtPct(equityPct)}
            </td>
            <td style={{ ...td, borderTop: `2px solid ${theme.border}` }} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
