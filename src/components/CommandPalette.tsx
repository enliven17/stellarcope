import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import gsap from 'gsap'
import { getLenis, reducedMotion } from '../lib/smooth'
import { REPO } from '../lib/site'
import { TRACKER } from '../../packages/tracker/release'

type Command = { id: string; label: string; hint: string; run: () => void }

/** page level commands are announced with this event, e.g. switching a dashboard tab */
export const emit = (action: string, value?: string) => window.dispatchEvent(new CustomEvent('stellarcope:cmd', { detail: { action, value } }))

const SNIPPET = `<script defer src="https://stellarcope.xyz${TRACKER.path}" integrity="${TRACKER.integrity}" crossorigin="anonymous" data-site="YOUR_SITE_ID"></script>`

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const commands: Command[] = useMemo(() => {
    const go = (to: string) => () => navigate(to)
    return [
      { id: 'tenant', label: 'Open tenant dashboard', hint: 'view', run: go('/demo') },
      { id: 'pilot', label: 'Open my private dashboard', hint: 'view', run: go('/pilot') },
      { id: 'operator', label: 'Open operator view', hint: 'view', run: go('/operator') },
      { id: 'card', label: 'Open public card', hint: 'view', run: go('/p/stellarcope') },
      { id: 'docs', label: 'Read the docs', hint: 'docs', run: go('/docs') },
      { id: 'home', label: 'Back to the landing page', hint: 'site', run: go('/') },
      { id: 'web', label: 'Show web analytics', hint: 'tab', run: () => { navigate('/demo'); setTimeout(() => emit('tab', 'Web'), 50) } },
      { id: 'api', label: 'Show API analytics', hint: 'tab', run: () => { navigate('/demo'); setTimeout(() => emit('tab', 'API'), 50) } },
      { id: 'wallets', label: 'Show wallet funnel', hint: 'tab', run: () => { navigate('/demo'); setTimeout(() => emit('tab', 'Wallets'), 50) } },
      { id: 'trust', label: 'Show trust and seals', hint: 'tab', run: () => { navigate('/demo'); setTimeout(() => emit('tab', 'Trust'), 50) } },
      ...[7, 30, 90].map((d) => ({ id: `r${d}`, label: `Range: last ${d} days`, hint: 'range', run: () => emit('range', String(d)) })),
      { id: 'copy', label: 'Copy the tracker snippet', hint: 'copy', run: () => { void navigator.clipboard?.writeText(SNIPPET) } },
      { id: 'repo', label: 'Open the repository', hint: 'link', run: () => window.open(REPO, '_blank', 'noreferrer') },
    ]
  }, [navigate])

  const list = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v) }
      if (e.key === 'Escape') setOpen(false)
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('stellarcope:palette', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('stellarcope:palette', onOpen) }
  }, [])

  useEffect(() => {
    const lenis = getLenis()
    if (open) { setQ(''); setI(0); lenis?.stop(); setTimeout(() => input.current?.focus(), 10) } else lenis?.start()
  }, [open])

  useLayoutEffect(() => {
    if (open && box.current && !reducedMotion()) gsap.fromTo(box.current, { opacity: 0, y: -12, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'power3.out' })
  }, [open])

  if (!open) return null
  const run = (c: Command | undefined) => { if (!c) return; setOpen(false); c.run() }

  return (
    <div className="fixed inset-0 z-[200] grid place-items-start bg-space/70 px-4 pt-[14vh]" onMouseDown={() => setOpen(false)}>
      <div ref={box} role="dialog" aria-modal aria-label="Command palette" className="hair mx-auto w-full max-w-xl border bg-panel shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="hair flex items-center gap-3 border-b px-4">
          <span className="font-mono text-[13px] text-gold">&gt;</span>
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} placeholder="Type a command"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(list.length - 1, x + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
              if (e.key === 'Enter') run(list[i])
            }}
            className="h-12 w-full bg-transparent font-mono text-[13px] text-ink outline-none placeholder:text-dim" aria-label="Command" />
          <span className="font-mono text-[11px] text-dim">esc</span>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-2" role="listbox" data-lenis-prevent>
          {list.map((c, k) => (
            <li key={c.id} role="option" aria-selected={k === i}>
              <button type="button" onMouseEnter={() => setI(k)} onClick={() => run(c)}
                className={`flex w-full items-baseline justify-between px-4 py-2.5 text-left text-[14px] transition-colors ${k === i ? 'bg-raise text-ink' : 'text-mute'}`}>
                <span>{k === i && <span className="mr-2 font-mono text-gold">[</span>}{c.label}{k === i && <span className="ml-2 font-mono text-gold">]</span>}</span>
                <span className="font-mono text-[11px] text-dim">{c.hint}</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="px-4 py-3 font-mono text-[12px] text-dim">No command matches.</li>}
        </ul>
      </div>
    </div>
  )
}
