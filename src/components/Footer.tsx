import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { figlet } from '../lib/figlet'
import { useScramble } from '../lib/useScramble'
import { getLenis, reducedMotion } from '../lib/smooth'
import { REPO } from '../lib/site'
import { Mark } from './Mark'

const WORD = figlet('STELLARCOPE')

const COLUMNS = [
  { title: 'Product', links: [
    { label: 'Live demo', to: '/demo' },
    { label: 'Operator view', to: '/operator' },
    { label: 'Public card', to: '/p/stellarcope' },
  ] },
  { title: 'Project', links: [
    { label: 'Docs', to: '/docs' },
    { label: 'Data processing', to: '/docs/data-processing' },
    { label: 'Source code', href: REPO },
    { label: 'Brand kit', href: `${REPO}/tree/main/brand` },
  ] },
  { title: 'Ecosystem', links: [
    { label: 'Stellar Community Fund', href: 'https://communityfund.stellar.org' },
    { label: 'Stellar Wallets Kit', href: 'https://stellarwalletskit.dev' },
    { label: 'Umami', href: 'https://umami.is' },
  ] },
]

export default function Footer() {
  const [wrap, text] = useScramble<HTMLDivElement>(WORD, 1500)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => el.classList.toggle('is-visible', e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [wrap])

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`)
  }

  const top = () => {
    const lenis = getLenis()
    if (lenis) lenis.scrollTo(0, { duration: 1.6 })
    else window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  return (
    <footer className="hair relative border-t" aria-label="Footer">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-4 pb-10 pt-20 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Mark size={32} />
          <p className="mt-5 text-sm leading-relaxed text-mute">
            Trusted, privacy-first web and API analytics for the Stellar ecosystem. Free for every project, run as a shared public good.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="label">{col.title}</p>
            <ul className="mt-5 space-y-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  {'to' in l
                    ? <Link to={l.to!} className="text-sm text-mute transition-colors hover:text-ink">{l.label}</Link>
                    : <a href={l.href} target="_blank" rel="noreferrer" className="text-sm text-mute transition-colors hover:text-ink">{l.label} <span aria-hidden className="text-dim">↗</span></a>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-[1440px] overflow-hidden px-4 sm:px-8">
        <div ref={wrap} onPointerMove={move} aria-hidden className="ascii-word relative mx-auto w-fit select-none">
          <pre className="ascii-pre text-[min(1.7vw,20px)] text-dim">{text}</pre>
          <pre className="ascii-word-color ascii-pre pointer-events-none absolute inset-0 text-[min(1.7vw,20px)]">{text}</pre>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-4 px-4 py-8 font-mono text-[11px] text-dim sm:flex-row sm:items-center sm:px-8">
        <span>© {new Date().getFullYear()} Stellarcope contributors. MIT licensed.</span>
        <span>Cookieless analytics. Built for the Stellar ecosystem.</span>
        <button type="button" onClick={top} className="text-mute transition-colors hover:text-ink">Back to top ↑</button>
      </div>
    </footer>
  )
}
