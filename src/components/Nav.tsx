import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { Logo } from './Mark'
import { getLenis, reducedMotion } from '../lib/smooth'
import { REPO } from '../lib/site'

function useUtcClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now.toISOString().slice(11, 19)
}

export default function Nav() {
  const bar = useRef<HTMLElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const [solid, setSolid] = useState(false)
  const [open, setOpen] = useState(false)
  const clock = useUtcClock()

  // solid after the first scroll; hides while reading down, returns on the way up
  useEffect(() => {
    let lastY = window.scrollY
    let hidden = false
    const onScroll = () => {
      const y = window.scrollY
      setSolid(y > 24)
      const hide = y > 480 && y > lastY && !open
      if (hide !== hidden && bar.current) {
        hidden = hide
        gsap.to(bar.current, { yPercent: hide ? -100 : 0, duration: 0.45, ease: 'power3.out' })
      }
      lastY = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [open])

  // full screen sheet on small screens, scroll locked while open
  useEffect(() => {
    const lenis = getLenis()
    if (open) lenis?.stop()
    else lenis?.start()
    document.documentElement.style.overflow = open ? 'hidden' : ''
    if (open && sheet.current && !reducedMotion()) {
      gsap.fromTo(sheet.current.querySelectorAll('[data-item]'), { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: 'power4.out', stagger: 0.05 })
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <a href="#main" className="fixed left-4 top-4 z-[120] -translate-y-24 bg-ink px-4 py-3 font-mono text-xs text-space focus:translate-y-0">Skip to content</a>
      <header ref={bar} className={`fixed inset-x-0 top-0 z-[100] border-b transition-colors duration-500 ${solid || open ? 'hair bg-space' : 'border-transparent'}`}>
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-8">
          <Link to="/" aria-label="Stellarcope home" onClick={() => setOpen(false)}>
            <Logo />
          </Link>

          <div className="flex items-center gap-5">
            <span className="hidden font-mono text-[11px] text-dim xl:inline" aria-label="Coordinated universal time">UTC {clock}</span>
            <Link to="/docs" className="hidden font-mono text-[12px] text-mute transition-colors hover:text-ink sm:inline">Docs</Link>
            <Link to="/pilot" className="hidden font-mono text-[12px] text-mute transition-colors hover:text-ink sm:inline">My dashboard</Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="hidden font-mono text-[12px] text-mute transition-colors hover:text-ink md:inline">GitHub</a>
            <Link to="/demo" className="btn btn-solid hidden h-9 sm:inline-flex">Live demo <span className="arrow">→</span></Link>
            <button type="button" className="font-mono text-[12px] text-ink lg:hidden" aria-expanded={open} aria-controls="menu-sheet" onClick={() => setOpen((v) => !v)}>
              {open ? '[ close ]' : '[ menu ]'}
            </button>
          </div>
        </nav>
      </header>

      {open && (
        <div id="menu-sheet" ref={sheet} className="fixed inset-0 z-[90] flex flex-col justify-end bg-space px-4 pb-8 pt-24 sm:px-8 lg:hidden">
          <div className="overflow-hidden">
            <div data-item className="flex flex-wrap gap-3">
              <Link to="/demo" onClick={() => setOpen(false)} className="btn btn-solid">Live demo <span className="arrow">→</span></Link>
              <Link to="/pilot" onClick={() => setOpen(false)} className="btn">My dashboard <span className="arrow">→</span></Link>
              <Link to="/operator" onClick={() => setOpen(false)} className="btn">Operator view</Link>
              <Link to="/docs" onClick={() => setOpen(false)} className="btn">Docs</Link>
              <a href={REPO} target="_blank" rel="noreferrer" className="btn">GitHub</a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
