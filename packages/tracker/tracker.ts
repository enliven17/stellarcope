// Stellarcope web tracker. Cookieless: nothing is written to the device, no identifiers are
// created here. The collector derives a daily visitor hash server side.
import { campaign, eventName, scrubProps, webPath } from '../core/privacy.ts'

export type Props = Record<string, string | number | boolean>
export type Options = {
  site: string
  endpoint: string
  respectDnt?: boolean
  excludePaths?: string[]
}

type Payload = {
  site: string
  type: 'pageview' | 'event'
  name?: string
  props?: Props
  path: string
  hostname: string
  referrer?: string
  utm?: Record<string, string>
  screen: { w: number; h: number }
  lang: string
  webdriver: boolean
}

const UTM = ['utm_source', 'utm_medium', 'utm_campaign']
let opts: Options | null = null
let lastPath = ''
let exclusions: string[] = []
const OWNER = Symbol.for('stellarcope.tracker')

function blocked() {
  if (!opts) return true
  if (!opts.respectDnt) return false
  const n = navigator as Navigator & { globalPrivacyControl?: boolean }
  return n.doNotTrack === '1' || n.globalPrivacyControl === true
}

function send(p: Payload) {
  try {
    // Omit dashboard credentials even when the analytics host is first party.
    // No automatic retries: legacy payloads do not carry a replay identity.
    const body = JSON.stringify(p)
    if (new Blob([body]).size > 8192) return
    fetch(opts!.endpoint, {
      method: 'POST',
      body,
      keepalive: true,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'text/plain' },
    }).catch(() => {})
  } catch {
    /* analytics must never interrupt the host application */
  }
}

function base(type: Payload['type']): Payload | null {
  const url = new URL(location.href)
  const decoded = decodeURIComponent(url.pathname)
  if (
    exclusions.some(
      (prefix) => prefix === '/' || decoded === prefix || decoded.startsWith(`${prefix}/`),
    )
  )
    return null
  const path = webPath(url.pathname)
  if (!path) return null
  const utm: Record<string, string> = {}
  for (const k of UTM) {
    const v = url.searchParams.get(k)
    if (campaign(v)) utm[k.slice(4)] = v
  }
  let referrer: string | undefined
  if (document.referrer) {
    try {
      const r = new URL(document.referrer)
      if (r.hostname !== location.hostname) referrer = r.origin
    } catch {
      /* ignore malformed referrer */
    }
  }
  return {
    site: opts!.site,
    type,
    path,
    hostname: location.hostname,
    referrer,
    utm: Object.keys(utm).length ? utm : undefined,
    screen: { w: screen.width, h: screen.height },
    lang: navigator.language,
    webdriver: navigator.webdriver === true,
  }
}

export function pageview() {
  try {
    if (blocked()) {
      lastPath = ''
      return
    }
    const path = location.pathname
    const data = base('pageview')
    if (!data) {
      lastPath = ''
      return
    }
    if (path === lastPath) return
    lastPath = path
    send(data)
  } catch {
    /* a blocked browser API must not interrupt navigation */
  }
}

export function track(name: string, props?: Props) {
  try {
    if (blocked() || !eventName(name)) return
    const data = base('event')
    if (data) send({ ...data, name, props: scrubProps(props) })
  } catch {
    /* optional tracking must not interrupt an action */
  }
}

/** starts page view tracking, single page app navigations included */
export function init(o: Options) {
  if (opts || typeof window === 'undefined') return false
  const host = window as unknown as Record<symbol, boolean>
  try {
    if (host[OWNER]) return false
    if (!Array.isArray(o.excludePaths ?? [])) return false
    const prefixes = (o.excludePaths ?? []).map((prefix) => {
      const path = decodeURIComponent(prefix.trim())
      if (!path.startsWith('/') || path.startsWith('//') || /[\s?#*\\\x00-\x1f\x7f]/.test(path))
        throw new Error('Invalid exclusion')
      return path.replace(/\/+$/, '') || '/'
    })
    Object.defineProperty(host, OWNER, { value: true })
    opts = { ...o, respectDnt: o.respectDnt !== false }
    exclusions = prefixes
  } catch {
    return false
  }
  const schedule = () => {
    try {
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(pageview)
        return
      }
    } catch {
      /* fall back if the host has replaced the scheduler */
    }
    try {
      void Promise.resolve()
        .then(pageview)
        .catch(() => {})
    } catch {
      /* never interrupt routing */
    }
  }
  const wrap = (key: 'pushState' | 'replaceState') => {
    const original = history[key]
    history[key] = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = original.apply(this, args)
      schedule()
      return r
    }
  }
  try {
    wrap('pushState')
  } catch {
    /* some hosts lock History methods */
  }
  try {
    wrap('replaceState')
  } catch {
    /* initial pageviews still work */
  }
  try {
    addEventListener('popstate', pageview)
    if (document.readyState !== 'loading') pageview()
    else addEventListener('DOMContentLoaded', pageview, { once: true })
  } catch {
    /* restricted browser APIs must not interrupt the host */
  }
  return true
}
