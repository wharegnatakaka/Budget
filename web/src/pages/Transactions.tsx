import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useTheme } from '../context/ThemeContext'

interface Transaction {
  id: number
  date: string
  payee: string
  memo: string | null
  amount: string
  processing_status: string
  haiku_category: string | null
  haiku_confidence: string | null
  manually_categorised: boolean
  transaction_category_id: number | null
  transaction_category_name: string | null
  budget_category_name: string | null
}

interface TransactionCategory {
  id: number
  name: string
  budget_category_id: number
  budget_category_name: string
}

interface Meta {
  total: number
  page: number
  per_page: number
}

const fmt = (v: string | number) => `$${Math.abs(Number(v)).toFixed(2)}`

const PER_PAGE = 50

export default function Transactions() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const categoryId          = params.get('category_id')
  const psAccountId         = params.get('ps_account_id')
  const ownBudgetCategoryId = params.get('own_budget_category_id')
  const start               = params.get('start')
  const end                 = params.get('end')
  const categoryName = params.get('name') ?? 'Transactions'
  const isFiltered   = !!(categoryId || psAccountId || start || end)

  const [transactions, setTransactions]     = useState<Transaction[]>([])
  const [meta, setMeta]                     = useState<Meta | null>(null)
  const [txCategories, setTxCategories]     = useState<TransactionCategory[]>([])
  const [savingCategory, setSavingCategory] = useState<Set<number>>(new Set())
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(true)
  const [reclassifying, setReclassifying] = useState<Set<number>>(new Set())
  const [bulkWorking, setBulkWorking]   = useState(false)
  const [runningNow, setRunningNow]     = useState(false)

  async function load(p = page) {
    setLoading(true)
    const q = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) })
    if (categoryId)          q.set('budget_category_id', categoryId)
    if (psAccountId)         q.set('ps_account_id', psAccountId)
    if (ownBudgetCategoryId) q.set('own_budget_category_id', ownBudgetCategoryId)
    if (start)               q.set('start_date', start)
    if (end)                 q.set('end_date', end)
    const res = await api.get<{ data: Transaction[]; meta: Meta }>(`/transactions?${q}`)
    setTransactions(res.data)
    setMeta(res.meta)
    setLoading(false)
  }

  useEffect(() => {
    api.get<TransactionCategory[]>('/transaction_categories').then(setTxCategories)
  }, [])

  useEffect(() => { setPage(1); load(1) }, [categoryId, psAccountId, ownBudgetCategoryId, start, end])
  useEffect(() => { load(page) }, [page])

  async function updateCategory(t: Transaction, txCategoryId: number) {
    setSavingCategory(s => new Set(s).add(t.id))
    const updated = await api.patch<Transaction>(`/transactions/${t.id}`, {
      transaction: { transaction_category_id: txCategoryId, manually_categorised: true }
    })
    setTransactions(ts => ts.map(x => x.id === t.id ? { ...x, ...updated } : x))
    setSavingCategory(s => { const n = new Set(s); n.delete(t.id); return n })
  }

  async function reprocessOne(id: number) {
    setReclassifying(s => new Set(s).add(id))
    await api.post(`/transactions/${id}/reprocess`, {})
    setReclassifying(s => { const n = new Set(s); n.delete(id); return n })
    await load()
  }

  async function reprocessAll() {
    setBulkWorking(true)
    const ids = transactions.map(t => t.id)
    await api.post('/transactions/reprocess_bulk', { ids })
    setBulkWorking(false)
    await load()
  }

  async function runNow() {
    setRunningNow(true)
    await api.post('/jobs/categorise', {})
    // Poll until no pending transactions remain, then reload
    const poll = setInterval(async () => {
      const res = await api.get<{ data: Transaction[]; meta: Meta }>(`/transactions?per_page=1&status=imported`)
      if (res.meta.total === 0) {
        clearInterval(poll)
        setRunningNow(false)
        await load()
      }
    }, 2000)
  }

  const totalPages = meta ? Math.ceil(meta.total / PER_PAGE) : 1

  const btn: React.CSSProperties = {
    fontSize: '0.75rem',
    padding: '0.15rem 0.4rem',
    cursor: 'pointer',
    border: `1px solid ${theme.border}`,
    borderRadius: 4,
    background: theme.surface,
    color: theme.textMuted,
  }

  const th: React.CSSProperties = {
    padding: '0.4rem 0.5rem',
    borderBottom: `2px solid ${theme.border}`,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: theme.text,
    textAlign: 'left',
    whiteSpace: 'nowrap',
  }

  const td: React.CSSProperties = {
    padding: '0.4rem 0.5rem',
    borderBottom: `1px solid ${theme.border}`,
    fontSize: '0.875rem',
    color: theme.text,
  }

  function statusBadge(t: Transaction) {
    if (t.manually_categorised) return <span style={{ fontSize: '0.7rem', color: theme.accent }}>manual</span>
    if (t.processing_status === 'imported') return <span style={{ fontSize: '0.7rem', color: theme.textMuted }}>pending</span>
    if (t.processing_status === 'failed') return <span style={{ fontSize: '0.7rem', color: theme.danger }}>failed</span>
    return null
  }

  return (
    <div style={{ maxWidth: 1000, color: theme.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.25rem' }}>
        {isFiltered && (
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: '1rem', padding: 0 }}
          >←</button>
        )}
        <h1 style={{ margin: 0 }}>{isFiltered ? categoryName : 'Transactions'}</h1>
        <button onClick={runNow} disabled={runningNow} style={{ marginLeft: 'auto', ...btn, color: theme.accent, borderColor: theme.accent }}>
          {runningNow ? 'Running…' : '▶ Run now'}
        </button>
      </div>
      {start && end && (
        <p style={{ margin: '0 0 1.5rem', color: theme.textMuted, fontSize: '0.85rem' }}>{start} – {end}</p>
      )}
      {!isFiltered && <p style={{ margin: '0 0 1.5rem', color: theme.textMuted, fontSize: '0.85rem' }}>All transactions</p>}

      {loading ? (
        <p style={{ color: theme.textMuted }}>Loading…</p>
      ) : transactions.length === 0 ? (
        <p style={{ color: theme.textMuted }}>No transactions found.</p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Payee</th>
                <th style={th}>Memo</th>
                <th style={th}>Category</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                <th style={{ ...th, width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id} style={{ background: Number(t.amount) > 0 ? theme.surfaceAlt : 'transparent' }}>
                  <td style={td}>{t.date}</td>
                  <td style={td}>{t.payee}</td>
                  <td style={{ ...td, color: theme.textMuted, fontSize: '0.8rem' }}>{t.memo ?? '—'}</td>
                  <td style={td}>
                    {txCategories.length > 0 ? (
                      <select
                        value={t.transaction_category_id ?? ''}
                        disabled={savingCategory.has(t.id)}
                        onChange={e => updateCategory(t, Number(e.target.value))}
                        style={{
                          fontSize: '0.8rem',
                          background: theme.surface,
                          color: t.transaction_category_id ? theme.text : theme.textMuted,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 4,
                          padding: '0.1rem 0.25rem',
                          cursor: 'pointer',
                          opacity: savingCategory.has(t.id) ? 0.5 : 1,
                        }}
                      >
                        <option value="" disabled>— unset —</option>
                        {Object.entries(
                          txCategories.reduce<Record<string, TransactionCategory[]>>((groups, tc) => {
                            ;(groups[tc.budget_category_name] ??= []).push(tc)
                            return groups
                          }, {})
                        ).map(([group, options]) => (
                          <optgroup key={group} label={group}>
                            {options.map(tc => (
                              <option key={tc.id} value={tc.id}>{tc.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {t.transaction_category_name ?? t.haiku_category ?? <span style={{ color: theme.textMuted }}>—</span>}
                        {statusBadge(t)}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: Number(t.amount) > 0 ? theme.accent : theme.text }}>
                    {Number(t.amount) > 0 ? '+' : '-'}{fmt(t.amount)}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button
                      onClick={() => reprocessOne(t.id)}
                      disabled={reclassifying.has(t.id)}
                      title="Re-classify"
                      style={btn}
                    >↺</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.8rem', color: theme.textMuted }}>
              {meta?.total} transaction{meta?.total !== 1 ? 's' : ''}
              {isFiltered && ` · total spent: ${fmt(transactions.reduce((sum, t) => sum + (Number(t.amount) < 0 ? Math.abs(Number(t.amount)) : 0), 0))}`}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {totalPages > 1 && (
                <>
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 1} style={btn}>‹</button>
                  <span style={{ fontSize: '0.8rem', color: theme.textMuted }}>{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages} style={btn}>›</button>
                </>
              )}
              <button onClick={reprocessAll} disabled={bulkWorking} style={btn}>
                {bulkWorking ? 'Queuing…' : '↺ Re-classify all'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
