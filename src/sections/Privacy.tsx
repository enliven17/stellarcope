import { useRef } from 'react'
import { Container } from '../components/Section'
import { useReveal } from '../lib/reveal'
import { Link } from 'react-router-dom'

const KEPT = [
  'Page path, without the query string',
  'Referrer',
  'Country, browser, OS and device type',
  'A site-specific daily visitor hash',
]
const NEVER = [
  'Raw IP addresses and User-Agent strings',
  'Persistent cross-site visitor identifiers',
  'Visitor cookies or browser local storage',
  'API traces, spans and request bodies',
]

export default function Privacy() {
  const root = useRef<HTMLElement>(null)
  useReveal(root)

  return (
    <section id="privacy" ref={root} className="py-32">
      <Container>
        <h2 className="max-w-4xl text-[clamp(2.2rem,5vw,4.2rem)] font-medium leading-[1] tracking-[-0.035em]" data-reveal>
          Useful statistics, less visitor data. <span className="text-mute">No persistent cross-site identifier.</span>
        </h2>

        <div className="mt-20 grid gap-16 md:grid-cols-2">
          {[
            { title: 'Stored', rows: KEPT, mark: '+', cls: 'text-gold' },
            { title: 'Excluded from analytics records', rows: NEVER, mark: '×', cls: 'text-dim' },
          ].map((col) => (
            <div key={col.title} data-reveal>
              <p className="label">{col.title}</p>
              <ul className="mt-6">
                {col.rows.map((r) => (
                  <li key={r} className="hair flex items-baseline gap-4 border-t py-4 text-[15px]">
                    <span className={`font-mono ${col.cls}`} aria-hidden>{col.mark}</span>
                    <span className={col.title === 'Stored' ? '' : 'text-mute'}>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-16 text-sm leading-relaxed text-mute" data-reveal>Production is planned for EU infrastructure in Frankfurt and Ireland; the current pilot is US-hosted. Pseudonymous analytics is not a guarantee of anonymity. <Link to="/docs/data-processing" className="text-ink underline underline-offset-4">Read the data processing information.</Link></p>
      </Container>
    </section>
  )
}
