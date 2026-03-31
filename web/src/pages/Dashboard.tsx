import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import ColourPicker from '../components/ColourPicker'
import { useColours } from '../hooks/useColours'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api/client'
import { useTheme, Theme } from '../context/ThemeContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FixedExpense {
  id: number
  name: string
  fortnightly_amount: string
}

interface Category {
  id: number
  name: string
  section: string
  fortnightly_amount: string
  sam_amount: string | null
  ish_amount: string | null
  sam_pct: string | null
  ish_pct: string | null
  position: number
  spent: number
  ps_account_id?: string
  pending?: number
}

interface MortgageData {
  id: number
  label: string | null
  current_balance: string | null
}

interface DashboardData {
  period: { id: number; start_date: string; end_date: string; prev_id: number | null; next_id: number | null }
  salaries: { sam: string; ish: string; total: string }
  fixed_expenses: FixedExpense[]
  fixed_expenses_total: string
  categories: Category[]
  account_spending: { general: number; spending: number }
  pending_by_ps_account: Record<string, number>
  transaction_status: { processed: number; imported: number; failed: number }
  savings_accounts: { id: number; name: string; current_balance: string }[]
}

type AllocMode = 'fixed' | 'pct'

interface CategoryEditState {
  name: string
  section: string
  sam_value: string
  sam_mode: AllocMode
  ish_value: string
  ish_mode: AllocMode
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number | string | null | undefined) =>
  v == null ? '—' : `$${Number(v).toFixed(2)}`

const fmtPct = (v: string | number | null) =>
  v == null ? '—' : `${Number(v).toFixed(1)}%`

// ── Style factories (depend on theme) ─────────────────────────────────────────

const mkStyles = (t: Theme) => ({
  td: (right = false, bold = false): React.CSSProperties => ({
    padding: '0.35rem 0.5rem',
    borderBottom: `1px solid ${t.border}`,
    textAlign: right ? 'right' : 'left',
    fontWeight: bold ? 600 : 400,
    color: t.text,
  }),
  tdBase: {
    padding: '0.35rem 0.5rem',
    borderBottom: `1px solid ${t.border}`,
    color: t.text,
  } as React.CSSProperties,
  totalRow: {
    borderTop: `2px solid ${t.border}`,
    background: t.surface,
  } as React.CSSProperties,
  sectionHeader: {
    padding: '0.5rem',
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: t.textMuted,
    background: t.surface,
    borderBottom: `1px solid ${t.border}`,
  } as React.CSSProperties,
  input: {
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 4,
    padding: '0.2rem 0.4rem',
    background: t.inputBg,
    color: t.text,
    fontSize: '0.85rem',
  } as React.CSSProperties,
  btn: {
    fontSize: '0.75rem',
    padding: '0.2rem 0.5rem',
    cursor: 'pointer',
    border: `1px solid ${t.border}`,
    borderRadius: 4,
    background: t.surface,
    color: t.text,
  } as React.CSSProperties,
})

// ── Sub-components ────────────────────────────────────────────────────────────

function BudgetSplitDonut({ outgoingTotal, spendingTotal, savingTotal, theme, getColour, setColour }: {
  outgoingTotal: number; spendingTotal: number; savingTotal: number; theme: Theme
  getColour: (key: string, fallback: string) => string
  setColour: (key: string, hex: string) => void
}) {
  const [picker, setPicker] = useState<{ key: string; anchor: { x: number; y: number } } | null>(null)
  const [hovered, setHovered] = useState(false)

  const data = [
    { key: 'split-outgoing', name: 'Outgoing', value: outgoingTotal, fallback: theme.danger },
    { key: 'split-spending', name: 'Spending', value: spendingTotal, fallback: theme.accent },
    { key: 'split-saving',   name: 'Saving',   value: savingTotal,   fallback: '#10b981' },
  ].map(d => ({ ...d, color: getColour(d.key, d.fallback) }))

  const total = outgoingTotal + spendingTotal + savingTotal

  function openPicker(key: string, e: React.MouseEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setPicker({ key, anchor: { x: rect.right + 6, y: rect.top } })
    e.stopPropagation()
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 200, flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ResponsiveContainer width={180} height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={72}
            startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v: number) => [`${fmt(v)} (${total > 0 ? ((v / total) * 100).toFixed(0) : 0}%)`, '']} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ width: '100%', marginTop: 4 }}>
        {data.map(d => (
          <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
              <span style={{ color: theme.textMuted }}>{d.name}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: theme.text, fontWeight: 500 }}>{total > 0 ? `${((d.value / total) * 100).toFixed(0)}%` : '—'}</span>
              {hovered && (
                <span onClick={e => openPicker(d.key, e)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: '0.7rem', lineHeight: 1 }}>✎</span>
              )}
            </span>
          </div>
        ))}
      </div>
      {picker && (
        <ColourPicker
          colour={getColour(picker.key, '#ffffff')}
          onChange={hex => setColour(picker.key, hex)}
          onClose={() => setPicker(null)}
          anchor={picker.anchor}
        />
      )}
    </div>
  )
}


function EquityDonut({ mortgages, propertyValue, theme, getColour, setColour }: {
  mortgages: MortgageData[]; propertyValue: number | null; theme: Theme
  getColour: (key: string, fallback: string) => string
  setColour: (key: string, hex: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [picker, setPicker]   = useState<{ key: string; anchor: { x: number; y: number } } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const totalDebt = mortgages.reduce((sum, m) => sum + Math.abs(Number(m.current_balance ?? 0)), 0)
  const equity    = propertyValue != null ? propertyValue - totalDebt : null
  const equityPct = propertyValue && propertyValue > 0 && equity != null
    ? ((equity / propertyValue) * 100).toFixed(1)
    : null

  const data = [
    { name: 'Equity', value: equity != null ? Math.max(equity, 0) : 0 },
    { name: 'Debt',   value: totalDebt },
  ]

  const equityColour = getColour('equity-equity', '#10b981')
  const debtColour   = getColour('equity-debt', '#ef9a9a')

  const sliceColours = [equityColour, debtColour]
  const labels = [
    { key: 'equity-equity', name: 'Equity', colour: equityColour },
    { key: 'equity-debt',   name: 'Debt',   colour: debtColour },
  ]

  function openPicker(key: string, e: React.MouseEvent) {
    e.stopPropagation()
    const rect = wrapRef.current!.getBoundingClientRect()
    setPicker({ key, anchor: { x: rect.right + 6, y: rect.top } })
  }

  if (propertyValue == null) return null

  const fmt = (v: number) => `$${v.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}`

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 200, flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <ResponsiveContainer width={180} height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={72}
            startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
            {data.map((_, i) => <Cell key={i} fill={sliceColours[i]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => fmt(v)} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ width: '100%', marginTop: 4 }}>
        {labels.map(l => (
          <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.colour, flexShrink: 0 }} />
              <span style={{ color: theme.textMuted }}>{l.name}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: theme.text, fontWeight: 500 }}>
                {l.name === 'Equity' ? (equityPct ? `${equityPct}%` : '—') : `${(100 - Number(equityPct ?? 0)).toFixed(1)}%`}
              </span>
              {hovered && <span onClick={e => openPicker(l.key, e)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: '0.7rem' }}>✎</span>}
            </span>
          </div>
        ))}
        <div style={{ fontSize: '0.75rem', color: theme.textMuted, marginTop: 4, textAlign: 'center' }}>
          {equity != null ? fmt(equity) : '—'} equity
        </div>
      </div>
      {picker && (
        <ColourPicker
          colour={getColour(picker.key, '#ffffff')}
          onChange={hex => setColour(picker.key, hex)}
          onClose={() => setPicker(null)}
          anchor={picker.anchor}
        />
      )}
    </div>
  )
}

function DonutChart({ category, theme, onClick, getColour, setColour }: {
  category: Category; theme: Theme; onClick?: () => void
  getColour: (key: string, fallback: string) => string
  setColour: (key: string, hex: string) => void
}) {
  const budget    = Number(category.fortnightly_amount)
  const spent     = Number(category.spent)
  const over      = spent > budget
  const pending   = category.pending ?? 0
  const colourKey = `donut-${category.name}`
  const colour    = getColour(colourKey, over ? theme.danger : theme.accent)
  const [hovered, setHovered]   = useState(false)
  const [picker, setPicker]     = useState<{ anchor: { x: number; y: number } } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const data = [
    { name: 'Spent',     value: Math.min(spent, budget) },
    { name: 'Remaining', value: Math.max(budget - spent, 0) },
  ]

  function openPicker(e: React.MouseEvent) {
    e.stopPropagation()
    const rect = wrapRef.current!.getBoundingClientRect()
    setPicker({ anchor: { x: rect.right + 6, y: rect.top } })
  }

  return (
    <div
      ref={wrapRef}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ textAlign: 'center', width: 160, cursor: onClick ? 'pointer' : 'default', position: 'relative' }}
    >
      <div style={{ position: 'relative', display: 'inline-block', marginBottom: 15 }}>
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={70}
              startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
              <Cell fill={colour} />
              <Cell fill={theme.border} />
            </Pie>
            <Tooltip formatter={(v: number) => fmt(v)} />
          </PieChart>
        </ResponsiveContainer>
        {pending > 0 && spent === 0 && (
          <div style={{ position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: '50%', background: theme.textMuted, opacity: 0.6 }} title={`${pending} pending`} />
        )}
        {hovered && (
          <div onClick={openPicker} style={{ position: 'absolute', top: 6, left: 6, cursor: 'pointer', color: theme.textMuted, fontSize: '0.75rem', lineHeight: 1 }}>✎</div>
        )}
      </div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: -8, color: theme.text }}>{category.name}</div>
      <div style={{ fontSize: '0.8rem', color: theme.textMuted }}>
        {fmt(spent)} / {fmt(budget)}
        {pending > 0 && spent === 0 && <span style={{ marginLeft: 6, color: theme.textMuted, opacity: 0.7 }}>({pending} pending)</span>}
      </div>
      <div style={{ fontSize: '0.75rem', color: over ? theme.danger : theme.textMuted }}>
        {budget > 0 ? `${Math.min((spent / budget) * 100, 100).toFixed(0)}%` : '—'}
      </div>
      {picker && (
        <ColourPicker
          colour={colour}
          onChange={hex => setColour(colourKey, hex)}
          onClose={() => setPicker(null)}
          anchor={picker.anchor}
        />
      )}
    </div>
  )
}

function SortableCategoryRow({
  category, onEdit, theme,
}: {
  category: Category
  onEdit: () => void
  theme: Theme
}) {
  const s = mkStyles(theme)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id })

  return (
    <tr ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      <td style={{ ...s.tdBase, width: 28, cursor: 'grab', color: theme.textMuted, userSelect: 'none' }} {...attributes} {...listeners}>⠿</td>
      <td style={s.td()}>{category.name}</td>
      <td style={s.td(true)}>
        {category.sam_pct != null ? fmtPct(category.sam_pct) : fmt(category.sam_amount)}
      </td>
      <td style={s.td(true)}>
        {category.ish_pct != null ? fmtPct(category.ish_pct) : fmt(category.ish_amount)}
      </td>
      <td style={s.td(true)}>{fmt(category.fortnightly_amount)}</td>
      <td style={{ ...s.tdBase, textAlign: 'right' }}>
        <button onClick={onEdit} style={s.btn}>Edit</button>
      </td>
    </tr>
  )
}

function CategoryEditRow({
  editState, samIncome, ishIncome, theme,
  onChange, onSave, onCancel,
}: {
  editState: CategoryEditState
  samIncome: number
  ishIncome: number
  theme: Theme
  onChange: (s: CategoryEditState) => void
  onSave: () => void
  onCancel: () => void
}) {
  const s = mkStyles(theme)

  function toggleMode(person: 'sam' | 'ish') {
    if (person === 'sam') {
      const newMode: AllocMode = editState.sam_mode === 'fixed' ? 'pct' : 'fixed'
      const newVal = newMode === 'pct'
        ? samIncome > 0 ? ((Number(editState.sam_value) / samIncome) * 100).toFixed(2) : '0'
        : ((Number(editState.sam_value) / 100) * samIncome).toFixed(2)
      onChange({ ...editState, sam_mode: newMode, sam_value: newVal })
    } else {
      const newMode: AllocMode = editState.ish_mode === 'fixed' ? 'pct' : 'fixed'
      const newVal = newMode === 'pct'
        ? ishIncome > 0 ? ((Number(editState.ish_value) / ishIncome) * 100).toFixed(2) : '0'
        : ((Number(editState.ish_value) / 100) * ishIncome).toFixed(2)
      onChange({ ...editState, ish_mode: newMode, ish_value: newVal })
    }
  }

  return (
    <tr style={{ background: theme.surfaceAlt }}>
      <td style={s.tdBase} />
      <td style={s.tdBase}>
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input value={editState.name} onChange={e => onChange({ ...editState, name: e.target.value })}
            style={{ ...s.input, flex: 1 }} />
          <button
            onClick={() => onChange({ ...editState, section: editState.section === 'spending' ? 'saving' : 'spending' })}
            style={{ ...s.btn, whiteSpace: 'nowrap', fontSize: '0.7rem' }}
          >
            {editState.section === 'spending' ? '→ Saving' : '→ Spending'}
          </button>
        </span>
      </td>
      <td style={{ ...s.tdBase, textAlign: 'right' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
          <input value={editState.sam_value} onChange={e => onChange({ ...editState, sam_value: e.target.value })}
            style={{ ...s.input, width: 70, textAlign: 'right' }} />
          <button onClick={() => toggleMode('sam')} style={s.btn}>{editState.sam_mode === 'fixed' ? '$' : '%'}</button>
        </span>
      </td>
      <td style={{ ...s.tdBase, textAlign: 'right' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
          <input value={editState.ish_value} onChange={e => onChange({ ...editState, ish_value: e.target.value })}
            style={{ ...s.input, width: 70, textAlign: 'right' }} />
          <button onClick={() => toggleMode('ish')} style={s.btn}>{editState.ish_mode === 'fixed' ? '$' : '%'}</button>
        </span>
      </td>
      <td style={s.tdBase} />
      <td style={{ ...s.tdBase, textAlign: 'right' }}>
        <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button onClick={onSave} style={s.btn}>Save</button>
          <button onClick={onCancel} style={s.btn}>✕</button>
        </span>
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { theme } = useTheme()
  const s = mkStyles(theme)
  const navigate = useNavigate()

  const { getColour, setColour } = useColours()
  const [data, setData]                   = useState<DashboardData | null>(null)
  const [mortgages, setMortgages]         = useState<MortgageData[]>([])
  const [propertyValue, setPropertyValue] = useState<number | null>(null)
  const [periodId, setPeriodId]           = useState<number | null>(null)
  const [spendingCats, setSpendingCats]   = useState<Category[]>([])
  const [savingCats, setSavingCats]       = useState<Category[]>([])
  const [editingExpense, setEditingExpense] = useState<number | null>(null)
  const [expenseEdit, setExpenseEdit]     = useState({ name: '', fortnightly_amount: '' })
  const [newExpense, setNewExpense]       = useState<{ name: string; fortnightly_amount: string } | null>(null)
  const [expensesOpen, setExpensesOpen]   = useState(false)
  const [editingCategory, setEditingCategory] = useState<number | null>(null)
  const [categoryEdit, setCategoryEdit]   = useState<CategoryEditState>({ name: '', section: 'spending', sam_value: '', sam_mode: 'fixed', ish_value: '', ish_mode: 'fixed' })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function load(pid?: number | null) {
    const q = pid ? `?period_id=${pid}` : ''
    const d = await api.get<DashboardData>(`/dashboard${q}`)
    setData(d)
    setSpendingCats(d.categories.filter(c => c.section === 'spending' && c.name !== 'Spending'))
    setSavingCats(d.categories.filter(c => c.section === 'saving'))
  }

  useEffect(() => { load(periodId) }, [periodId])

  useEffect(() => {
    Promise.all([
      api.get<MortgageData[]>('/mortgages'),
      api.get<{ value: string | null }>('/settings/property_value'),
    ]).then(([ms, setting]) => {
      setMortgages(ms)
      setPropertyValue(setting.value ? Number(setting.value) : null)
    })
  }, [])

  if (!data) return <p style={{ color: theme.textMuted }}>Loading…</p>

  const { period, salaries, fixed_expenses, fixed_expenses_total, categories, account_spending, pending_by_ps_account } = data

  // PS account IDs for constrained budget categories (matches ACCOUNT_PS_ID_CONSTRAINTS in Rails)
  const CATEGORY_PS_ACCOUNT: Record<string, string> = { 'Groceries': '2443000', 'Eating Out': '2443021' }

  const outgoing    = categories.find(c => c.section === 'outgoing')
  const spendingRow = categories.find(c => c.name === 'Spending')

  const samIncome = Number(salaries.sam)
  const ishIncome = Number(salaries.ish)

  // Spending (leftover) = income - everything else
  const nonSpendingTotal = categories.filter(c => c.name !== 'Spending').reduce((sum, c) => sum + Number(c.fortnightly_amount), 0)
  const spendingBudget   = Number(salaries.total) - nonSpendingTotal
  const spendingSam      = samIncome - categories.filter(c => c.name !== 'Spending').reduce((sum, c) => sum + Number(c.sam_amount ?? 0), 0)
  const spendingIsh      = ishIncome - categories.filter(c => c.name !== 'Spending').reduce((sum, c) => sum + Number(c.ish_amount ?? 0), 0)
  const spendingSpent    = spendingRow?.spent ?? 0

  const totalBudget = nonSpendingTotal + spendingBudget

  // Donut charts — Groceries + Eating Out + per-account spending widgets
  const budgetDonutCats: Category[] = spendingCats
    .filter(c => c.name !== 'Adventure' && c.name !== 'House')
    .map(c => ({ ...c, pending: pending_by_ps_account[CATEGORY_PS_ACCOUNT[c.name]] ?? 0 }))
  const accountDonutCats: Category[] = [
    { id: -2, name: 'General (Sam)', section: 'spending', fortnightly_amount: String(spendingSam), sam_amount: null, ish_amount: null, sam_pct: null, ish_pct: null, position: 98, spent: account_spending.general, ps_account_id: '2242603', pending: pending_by_ps_account['2242603'] ?? 0 },
    { id: -3, name: 'Spending (Ish)', section: 'spending', fortnightly_amount: String(spendingIsh), sam_amount: null, ish_amount: null, sam_pct: null, ish_pct: null, position: 99, spent: account_spending.spending, ps_account_id: '4873170', pending: pending_by_ps_account['4873170'] ?? 0 },
  ]

  // ── Fixed expense handlers ────────────────────────────────────────────────

  async function saveExpenseEdit(id: number) {
    await api.patch(`/fixed_expenses/${id}`, { fixed_expense: expenseEdit })
    await load(periodId); setEditingExpense(null)
  }
  async function deleteExpense(id: number) {
    await api.delete(`/fixed_expenses/${id}`)
    await load(periodId)
  }
  async function saveNewExpense() {
    if (!newExpense) return
    await api.post('/fixed_expenses', { fixed_expense: { ...newExpense, position: fixed_expenses.length + 1 } })
    await load(periodId); setNewExpense(null)
  }

  // ── Category handlers ─────────────────────────────────────────────────────

  function startEditCategory(cat: Category) {
    setEditingCategory(cat.id)
    setCategoryEdit({
      name:      cat.name,
      section:   cat.section,
      sam_value: cat.sam_pct != null ? String(Number(cat.sam_pct).toFixed(2)) : String(Number(cat.sam_amount ?? 0).toFixed(2)),
      sam_mode:  cat.sam_pct != null ? 'pct' : 'fixed',
      ish_value: cat.ish_pct != null ? String(Number(cat.ish_pct).toFixed(2)) : String(Number(cat.ish_amount ?? 0).toFixed(2)),
      ish_mode:  cat.ish_pct != null ? 'pct' : 'fixed',
    })
  }

  async function saveCategoryEdit() {
    if (editingCategory == null) return
    const payload: Record<string, string | null> = { name: categoryEdit.name, section: categoryEdit.section }
    if (categoryEdit.sam_mode === 'pct') { payload.sam_pct = categoryEdit.sam_value; payload.sam_amount = null }
    else { payload.sam_amount = categoryEdit.sam_value; payload.sam_pct = null }
    if (categoryEdit.ish_mode === 'pct') { payload.ish_pct = categoryEdit.ish_value; payload.ish_amount = null }
    else { payload.ish_amount = categoryEdit.ish_value; payload.ish_pct = null }
    await api.patch(`/budget_categories/${editingCategory}`, { budget_category: payload })
    await load(periodId); setEditingCategory(null)
  }

  function makeDragHandler(setter: React.Dispatch<React.SetStateAction<Category[]>>, sectionName: string) {
    return (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      setter(cats => {
        const oldIndex = cats.findIndex(c => c.id === active.id)
        const newIndex = cats.findIndex(c => c.id === over.id)
        const reordered = arrayMove(cats, oldIndex, newIndex)
        api.post('/budget_categories/reorder', {
          positions: reordered.map((c, i) => ({ id: c.id, position: i + 1 }))
        })
        return reordered
      })
    }
  }

  // ── Shared table structure ────────────────────────────────────────────────

  function CatTable({ children, hideHeader }: { children: React.ReactNode; hideHeader?: boolean }) {
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <colgroup>
          <col style={{ width: 28 }} />
          <col />
          <col style={{ width: 110 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 60 }} />
        </colgroup>
        {!hideHeader && (
          <thead>
            <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
              <th style={s.td()} />
              <th style={s.td()} />
              <th style={s.td(true)}>Sam</th>
              <th style={s.td(true)}>Ish</th>
              <th style={s.td(true)}>Total</th>
              <th style={s.td()} />
            </tr>
          </thead>
        )}
        {children}
      </table>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1300, color: theme.text }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.25rem' }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: theme.textMuted }}>
          <button
            onClick={() => period.prev_id && setPeriodId(period.prev_id)}
            disabled={!period.prev_id}
            style={{ background: 'none', border: 'none', cursor: period.prev_id ? 'pointer' : 'default', color: theme.textMuted, fontSize: '1rem', padding: '0 2px', opacity: period.prev_id ? 1 : 0.3 }}
          >‹</button>
          <span>{period.start_date} – {period.end_date}</span>
          <button
            onClick={() => period.next_id && setPeriodId(period.next_id)}
            disabled={!period.next_id}
            style={{ background: 'none', border: 'none', cursor: period.next_id ? 'pointer' : 'default', color: theme.textMuted, fontSize: '1rem', padding: '0 2px', opacity: period.next_id ? 1 : 0.3 }}
          >›</button>
        </div>
      </div>
      {/* ── Spend vs Budget donuts ── */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textMuted }}>Spend vs Budget</h2>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', paddingBottom: '1rem', alignItems: 'flex-start' }}>
          {budgetDonutCats.map(c => (
            <DonutChart key={c.id} category={c} theme={theme} getColour={getColour} setColour={setColour}
              onClick={() => navigate(`/transactions?${new URLSearchParams({ category_id: String(c.id), start: period.start_date, end: period.end_date, name: c.name })}`)}
            />
          ))}
          <div style={{ width: 1, background: theme.border, alignSelf: 'stretch', margin: '0 0.5rem' }} />
          {accountDonutCats.map(c => (
            <DonutChart key={c.id} category={c} theme={theme} getColour={getColour} setColour={setColour}
              onClick={() => navigate(`/transactions?${new URLSearchParams({ ps_account_id: c.ps_account_id!, start: period.start_date, end: period.end_date, name: c.name, ...(spendingRow ? { own_budget_category_id: String(spendingRow.id) } : {}) })}`)}
            />
          ))}
          <div style={{ width: 1, background: theme.border, alignSelf: 'stretch', margin: '0 0.5rem' }} />
          <BudgetSplitDonut
            outgoingTotal={Number(outgoing?.fortnightly_amount ?? 0)}
            spendingTotal={spendingBudget + spendingCats.reduce((sum, c) => sum + Number(c.fortnightly_amount), 0)}
            savingTotal={savingCats.reduce((sum, c) => sum + Number(c.fortnightly_amount), 0)}
            theme={theme}
            getColour={getColour}
            setColour={setColour}
          />
          {mortgages.length > 0 && propertyValue != null && (
            <>
              <div style={{ width: 1, background: theme.border, alignSelf: 'stretch', margin: '0 0.5rem' }} />
              <EquityDonut
                mortgages={mortgages}
                propertyValue={propertyValue}
                theme={theme}
                getColour={getColour}
                setColour={setColour}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Income ── */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textMuted }}>Income</h2>
        <CatTable>
          <tbody>
            <tr>
              <td style={s.tdBase} />
              <td style={s.td()}>Salary (fortnightly)</td>
              <td style={s.td(true)}>{fmt(salaries.sam)}</td>
              <td style={s.td(true)}>{fmt(salaries.ish)}</td>
              <td style={s.td(true, true)}>{fmt(salaries.total)}</td>
              <td style={s.tdBase} />
            </tr>
          </tbody>
        </CatTable>
      </div>

      {/* ── Budget Categories ── */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textMuted }}>Budget</h2>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>

        {/* Spending section (includes Outgoing as first row) */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={makeDragHandler(setSpendingCats, 'spending')}>
          <CatTable hideHeader>
            <tbody>
              <tr><td colSpan={7} style={s.sectionHeader}>Spending</td></tr>
              {outgoing && (
                <tr style={{ background: theme.surface }}>
                  <td style={s.tdBase} />
                  <td style={s.td()}>{outgoing.name}</td>
                  <td style={s.td(true)}>{fmt(outgoing.sam_amount)}</td>
                  <td style={s.td(true)}>{fmt(outgoing.ish_amount)}</td>
                  <td style={s.td(true)}>{fmt(outgoing.fortnightly_amount)}</td>
                  <td style={s.tdBase} />
                </tr>
              )}
              <SortableContext items={spendingCats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {spendingCats.map(cat =>
                  editingCategory === cat.id ? (
                    <CategoryEditRow key={cat.id} editState={categoryEdit} samIncome={samIncome} ishIncome={ishIncome} theme={theme} onChange={setCategoryEdit} onSave={saveCategoryEdit} onCancel={() => setEditingCategory(null)} />
                  ) : (
                    <SortableCategoryRow key={cat.id} category={cat} onEdit={() => startEditCategory(cat)} theme={theme} />
                  )
                )}
              </SortableContext>
              {/* Spending leftover row */}
              <tr style={{ background: theme.surface }}>
                <td style={s.tdBase} />
                <td style={s.td()}>Spending</td>
                <td style={s.td(true)}>{fmt(spendingSam)}</td>
                <td style={s.td(true)}>{fmt(spendingIsh)}</td>
                <td style={s.td(true)}>{fmt(spendingBudget)}</td>
                <td style={s.tdBase} />
              </tr>
            </tbody>
          </CatTable>
        </DndContext>

        <div style={{ marginTop: '1rem' }} />

        {/* Saving section */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={makeDragHandler(setSavingCats, 'saving')}>
          <CatTable hideHeader>
            <tbody>
              <tr><td colSpan={6} style={s.sectionHeader}>Saving</td></tr>
              <SortableContext items={savingCats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {savingCats.map(cat =>
                  editingCategory === cat.id ? (
                    <CategoryEditRow key={cat.id} editState={categoryEdit} samIncome={samIncome} ishIncome={ishIncome} theme={theme} onChange={setCategoryEdit} onSave={saveCategoryEdit} onCancel={() => setEditingCategory(null)} />
                  ) : (
                    <SortableCategoryRow key={cat.id} category={cat} onEdit={() => startEditCategory(cat)} theme={theme} />
                  )
                )}
              </SortableContext>
            </tbody>
            <tfoot>
              <tr style={s.totalRow}>
                <td style={s.tdBase} />
                <td style={s.td(false, true)}>Total</td>
                <td style={s.td(true, true)}>{fmt(samIncome)}</td>
                <td style={s.td(true, true)}>{fmt(ishIncome)}</td>
                <td style={s.td(true, true)}>{fmt(totalBudget)}</td>
                <td style={s.tdBase} />
              </tr>
            </tfoot>
          </CatTable>
        </DndContext>
        </div>{/* end tables column */}
        </div>{/* end flex row */}
      </div>

      {/* ── Fixed Expenses (accordion) ── */}
      <div style={{ marginBottom: '2rem', border: `1px solid ${theme.border}`, borderRadius: 6, overflow: 'hidden' }}>
        <button
          onClick={() => setExpensesOpen(o => !o)}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: theme.surface, border: 'none', cursor: 'pointer', color: theme.text, fontSize: '0.85rem' }}
        >
          <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textMuted }}>Fixed Expenses</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontWeight: 600 }}>{fmt(fixed_expenses_total)}</span>
            <span style={{ color: theme.textMuted, fontSize: '0.75rem' }}>{expensesOpen ? '▲' : '▼'}</span>
          </span>
        </button>
        {expensesOpen && (
          <div style={{ padding: '0.5rem 0.75rem 0.75rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <tbody>
                {fixed_expenses.map(e => (
                  <tr key={e.id} onDoubleClick={() => { setEditingExpense(e.id); setExpenseEdit({ name: e.name, fortnightly_amount: e.fortnightly_amount }) }} style={{ cursor: 'pointer' }}>
                    <td style={s.td()}>
                      {editingExpense === e.id
                        ? <input value={expenseEdit.name} onChange={ev => setExpenseEdit(v => ({ ...v, name: ev.target.value }))} style={{ ...s.input, width: '100%' }} />
                        : e.name}
                    </td>
                    <td style={s.td(true)}>
                      {editingExpense === e.id ? (
                        <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <input value={expenseEdit.fortnightly_amount} onChange={ev => setExpenseEdit(v => ({ ...v, fortnightly_amount: ev.target.value }))} style={{ ...s.input, width: 80, textAlign: 'right' }} />
                          <button onClick={() => saveExpenseEdit(e.id)} style={s.btn}>Save</button>
                          <button onClick={() => setEditingExpense(null)} style={s.btn}>✕</button>
                        </span>
                      ) : (
                        <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {fmt(e.fortnightly_amount)}
                          <button onClick={ev => { ev.stopPropagation(); deleteExpense(e.id) }} style={{ ...s.btn, color: theme.textMuted }}>✕</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {newExpense ? (
              <div style={{ display: 'flex', gap: 8, marginTop: '0.5rem', alignItems: 'center' }}>
                <input placeholder="Name" value={newExpense.name} onChange={ev => setNewExpense(v => ({ ...v!, name: ev.target.value }))} style={{ ...s.input, flex: 1 }} />
                <input placeholder="Amount" value={newExpense.fortnightly_amount} onChange={ev => setNewExpense(v => ({ ...v!, fortnightly_amount: ev.target.value }))} style={{ ...s.input, width: 90, textAlign: 'right' }} />
                <button onClick={saveNewExpense} style={s.btn}>Add</button>
                <button onClick={() => setNewExpense(null)} style={s.btn}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setNewExpense({ name: '', fortnightly_amount: '' })} style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Add expense</button>
            )}
            <p style={{ fontSize: '0.75rem', color: theme.textMuted, margin: '0.5rem 0 0' }}>Double-click a row to edit</p>
          </div>
        )}
      </div>

    </div>
  )
}
