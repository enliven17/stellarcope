// Stellarcope web tracker. Cookieless: nothing is written to the device, no identifiers are
// created here. The collector derives a daily visitor hash server side.

export type Props = Record<string, string | number | boolean>
export type Options = { site: string; endpoint: string; respectDnt?: boolean }

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
    fetch(opts!.endpoint, { method: 'POST', body: JSON.stringify(p), keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } }).catch(() => {})
  } catch { /* analytics must never interrupt the host application */ }
}

function base(type: Payload['type']): Payload {
  const url = new URL(location.href)
  const utm: Record<string, string> = {}
  for (const k of UTM) {
    const v = url.searchParams.get(k)
    if (v) utm[k.slice(4)] = v.slice(0, 100)
  }
  let referrer: string | undefined
  if (document.referrer) {
    try {
      const r = new URL(document.referrer)
      if (r.hostname !== location.hostname) referrer = r.origin
    } catch { /* ignore malformed referrer */ }
  }
  return {
    site: opts!.site,
    type,
    path: url.pathname,
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
    if (blocked()) return
    const path = location.pathname
    if (path === lastPath) return
    lastPath = path
    send(base('pageview'))
  } catch { /* a blocked browser API must not interrupt navigation */ }
}

export function track(name: string, props?: Props) {
  try {
    if (blocked() || !name) return
    send({ ...base('event'), name: name.slice(0, 64), props })
  } catch { /* optional tracking must not interrupt an action */ }
}

/** starts page view tracking, single page app navigations included */
export function init(o: Options) {
  if (opts) return
  opts = o
  const wrap = (key: 'pushState' | 'replaceState') => {
    const original = history[key]
    history[key] = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = original.apply(this, args)
      queueMicrotask(pageview)
      return r
    }
  }
  try { wrap('pushState') } catch { /* some hosts lock History methods */ }
  try { wrap('replaceState') } catch { /* initial pageviews still work */ }
  addEventListener('popstate', pageview)
  if (document.readyState !== 'loading') pageview()
  else addEventListener('DOMContentLoaded', pageview, { once: true })
}
