import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../api/client'
import { useTheme } from '../context/ThemeContext'

interface Status {
  processed: number
  transfers: number
  pending: number
  failed: number
}

export default function TransactionStatusWidget() {
  const { theme } = useTheme()
  const [status, setStatus]       = useState<Status | null>(null)
  const [runningNow, setRunningNow] = useState(false)

  async function load() {
    const res = await api.get<{ transaction_status: Status }>('/dashboard')
    setStatus(res.transaction_status)
  }

  useEffect(() => { load() }, [])

  const btn: React.CSSProperties = {
    fontSize: '0.7rem', padding: '0.2rem 0.5rem', cursor: 'pointer',
    border: `1px solid ${theme.border}`, borderRadius: 4,
    background: 'transparent', color: theme.textMuted,
  }

  async function runNow() {
    setRunningNow(true)
    await api.post('/jobs/categorise', {})
    const poll = setInterval(async () => {
      const res = await api.get<{ data: unknown[]; meta: { total: number } }>('/transactions?per_page=1&status=imported')
      if (res.meta.total === 0) {
        clearInterval(poll)
        setRunningNow(false)
        load()
      }
    }, 2000)
  }

  if (!status) return null

  const total = status.processed + status.transfers + status.pending + status.failed
  const slices = [
    { name: 'Processed', value: status.processed,  color: '#10b981' },
    { name: 'Transfers', value: status.transfers,   color: theme.accent },
    { name: 'Pending',   value: status.pending,     color: theme.textMuted },
    { name: 'Failed',    value: status.failed,       color: theme.danger },
  ].filter(d => d.value > 0)

  return (
    <div style={{ paddingTop: '1rem', borderTop: `1px solid ${theme.border}` }}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textMuted, marginBottom: '0.5rem' }}>
        Transactions
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie
            data={slices.length ? slices : [{ name: 'None', value: 1, color: theme.border }]}
            cx="50%" cy="50%" innerRadius={40} outerRadius={58}
            startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}
          >
            {(slices.length ? slices : [{ color: theme.border }]).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => [`${v} (${total > 0 ? ((v / total) * 100).toFixed(0) : 0}%)`, '']} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 4 }}>
        {[
          { label: 'Processed', value: status.processed,  color: '#10b981' },
          { label: 'Transfers', value: status.transfers,   color: theme.accent },
          { label: 'Pending',   value: status.pending,     color: theme.textMuted },
          { label: 'Failed',    value: status.failed,      color: theme.danger },
        ].map(d => (
          <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
              <span style={{ color: theme.textMuted }}>{d.label}</span>
            </span>
            <span style={{ color: theme.text, fontWeight: 500 }}>{d.value}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <button onClick={load} style={btn}>↺</button>
        <button onClick={runNow} disabled={runningNow} style={{ ...btn, color: theme.accent, borderColor: theme.accent }}>
          {runningNow ? 'Running…' : '▶ Run'}
        </button>
      </div>
    </div>
  )
}
