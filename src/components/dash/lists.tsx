import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toneHex, type Tone } from './core'
import { useApi, type Live } from '../../lib/api'
import { ago } from '../../lib/format'

/** square pixel fill drawn with CSS masks: 3px cells, 1px gaps */
const pixels = (color: string) => ({
  backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 4px)`,
  WebkitMaskImage: 'repeating-linear-gradient(0deg, #000 0 3px, transparent 3px 4px)',
  maskImage: 'repeating-linear-gradient(0deg, #000 0 3px, transparent 3px 4px)',
})

/** ranked rows with a dithered bar that springs to its width */
export function RankList({ rows, tone = 'gold', value, empty = 'Nothing recorded yet', limit = 6 }: {
  rows: { label: string; value: number; share?: number }[]; tone?: Tone; value?: (r: { label: string; value: number }, share: number) => string; empty?: string; limit?: number
}) {
  const top = Math.max(1, ...rows.map((r) => r.value))
  const total = rows.reduce((a, r) => a + r.value, 0) || 1
  if (!rows.length) return <p className="font-mono text-[12px] text-dim">{empty}</p>
  return (
    <ul className="space-y-3">
      {rows.slice(0, limit).map((r, i) => (
        <li key={r.label} className="group">
          <div className="flex items-baseline justify-between gap-4 text-[13px]">
            <span className="truncate text-ink" title={r.label}>{r.label}</span>
            <span className="shrink-0 font-mono text-[12px] text-mute">{value ? value(r, r.share ?? r.value / total) : `${r.value.toLocaleString('en-US')}  ${Math.round((r.share ?? r.value / total) * 100)}%`}</span>
          </div>
          <div className="mt-1.5 h-[10px] bg-[rgb(236_234_228/0.04)]">
            <motion.div className="h-full opacity-80 transition-opacity group-hover:opacity-100" style={pixels(toneHex(tone))}
              initial={{ width: 0 }} animate={{ width: `${Math.max(2, (r.value / top) * 100)}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22, delay: i * 0.05 }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** funnel: each step keeps its share of the first step */
export function Funnel({ steps, tone = 'blue' }: { steps: { label: string; value: number }[]; tone?: Tone }) {
  const first = steps[0]?.value || 0
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => {
        const share = first ? s.value / first : 0
        const prev = i ? steps[i - 1].value : 0
        return (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-[12px] text-ink">{s.label}</span>
              <span className="font-mono text-[12px] text-mute">{s.value.toLocaleString('en-US')}{i > 0 && prev ? `  ${Math.round((s.value / prev) * 100)}% of previous` : ''}</span>
            </div>
            <div className="mt-1.5 h-4 bg-[rgb(236_234_228/0.04)]">
              <motion.div className="h-full" style={pixels(toneHex(tone))} initial={{ width: 0 }} animate={{ width: `${Math.max(first ? 1 : 0, share * 100)}%` }}
                transition={{ type: 'spring', stiffness: 110, damping: 20, delay: i * 0.08 }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

const SPIN = ['|', '/', '-', '\\']

/** live events; rows enter from the top with a spring */
export function LiveStream({ tenant }: { tenant: string }) {
  const { data, error } = useApi<Live>(`/api/live?tenant=${encodeURIComponent(tenant)}`, 5000)
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPIN.length), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[12px] text-gold">[ {SPIN[frame]} ]</span>
        <span className="num text-3xl text-ink">{data?.active ?? '—'}</span>
        <span className="text-[13px] text-mute">visitors in the last 5 minutes</span>
      </div>
      {error && <p role="status" className="mt-3 text-sm text-gold">Live updates unavailable. {data ? 'Showing the previous response.' : 'Please try again shortly.'}</p>}
      <ol className="mt-5 max-h-[300px] flex-1 overflow-y-auto font-mono text-[12px]" data-lenis-prevent>
        {data && !data.events.length && <li className="text-dim">Waiting for the first event.</li>}
        <AnimatePresence initial={false}>
          {data?.events.map((e) => (
            <motion.li key={e.ts + e.path + (e.name ?? '')} layout
              initial={{ opacity: 0, y: -10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              className="hair grid grid-cols-[4.2rem_1fr_auto] gap-3 border-t py-2.5">
              <span className="text-dim">{ago(e.ts)}</span>
              <span className="truncate">{e.type === 'event' ? <span className="text-blue">{e.name}</span> : e.path}</span>
              <span className="text-mute">{e.country ?? '--'} {e.device.toLowerCase()}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  )
}
