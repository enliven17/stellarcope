import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { RateLimiter, dropReason } from '../../packages/core/filter.ts'
import { DailySalt, visitorId } from '../../packages/core/session.ts'
import type { Spool } from '../shared/spool.ts'
import type { SiteRegistry } from '../shared/sites.ts'
import { parseUa } from './ua.ts'
import { campaign, eventName, scrubProps, webPath } from '../../packages/core/privacy.ts'
export { scrubProps } from '../../packages/core/privacy.ts'

// Await the configured sink before acknowledging. The deployed sink commits to PostgreSQL;
// the standalone spool remains a best-effort prototype buffer.

const MAX_BODY = 8 * 1024
const TRACKER_DIR = new URL('../../packages/tracker/dist/', import.meta.url)

type Sink = { push(record: Parameters<Spool['push']>[0]): void | Promise<unknown> }
type Salt = { current(now?: number): Buffer | Promise<Buffer> }
type Deps = { sites: SiteRegistry; spool: Sink; salt?: Salt; limiter?: RateLimiter; now?: () => number }

type Incoming = {
  site: string
  type: 'pageview' | 'event'
  name?: string
  props?: Record<string, unknown>
  path: string
  hostname: string
  referrer?: string
  utm?: Record<string, string>
  screen?: { w: number; h: number }
  lang?: string
  webdriver?: boolean
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined)

/** strict shape check at the trust boundary; anything unexpected is rejected */
export function parsePayload(raw: string): Incoming | null {
  let j: Record<string, unknown>
  try { j = JSON.parse(raw) } catch { return null }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  if (Object.keys(j).some((key) => !['site','type','name','props','path','hostname','referrer','utm','screen','lang','webdriver'].includes(key))) return null
  const site = str(j.site, 64)
  const rawPath = str(j.path, 2048)
  const path = rawPath ? webPath(rawPath) : null
  const hostname = str(j.hostname, 253)
  const type = j.type === 'pageview' || j.type === 'event' ? j.type : null
  if (!site || !path || !hostname || !type || !path.startsWith('/')) return null
  if (type === 'event' && !eventName(j.name)) return null
  const screen = j.screen as { w?: unknown; h?: unknown } | undefined
  return {
    site, type, path, hostname,
    name: type === 'event' ? str(j.name, 64) : undefined,
    props: type === 'event' ? scrubProps(j.props) : undefined,
    referrer: str(j.referrer, 512),
    utm: j.utm && typeof j.utm === 'object' ? Object.fromEntries(Object.entries(j.utm as object).filter(([k, v]) => ['source', 'medium', 'campaign'].includes(k) && campaign(v))) as Record<string, string> : undefined,
    screen: screen && Number.isFinite(screen.w) && Number.isFinite(screen.h) ? { w: Number(screen.w), h: Number(screen.h) } : undefined,
    lang: str(j.lang, 35),
    webdriver: j.webdriver === true,
  }
}

function clientIp(req: IncomingMessage) {
  const fwd = req.headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  return first || req.socket.remoteAddress || '0.0.0.0'
}

function country(req: IncomingMessage) {
  const c = req.headers['cf-ipcountry'] ?? req.headers['x-vercel-ip-country'] ?? req.headers['x-country']
  const v = (Array.isArray(c) ? c[0] : c)?.toUpperCase()
  return v && /^[A-Z]{2}$/.test(v) && v !== 'XX' ? v : null
}

async function body(req: IncomingMessage) {
  // serverless runtimes may have read the stream already and expose it as req.body
  const pre = (req as IncomingMessage & { body?: unknown }).body
  if (pre !== undefined && pre !== null) {
    const text = typeof pre === 'string' ? pre : Buffer.isBuffer(pre) ? pre.toString('utf8') : JSON.stringify(pre)
    if (Buffer.byteLength(text) > MAX_BODY) throw Object.assign(new Error(), { status: 413 })
    return text
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw Object.assign(new Error(), { status: 413 })
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' }

export function collector({ sites, spool, salt = new DailySalt(), limiter = new RateLimiter(), now = Date.now }: Deps) {
  const stats = { accepted: 0, dropped: 0, invalid: 0 }

  async function ingest(req: IncomingMessage) {
    const raw = await body(req)
    const p = raw && parsePayload(raw)
    if (!p) { stats.invalid++; return 400 }
    const site = await sites.lookup(p.site)
    if (!site) { stats.invalid++; return 400 }

    const t = now()
    const ip = clientIp(req)
    const ua = String(req.headers['user-agent'] ?? '')
    const day = new Date(t).toISOString().slice(0, 10)
    const key = createHash('sha256').update(ip).update(p.site).digest('hex')
    const reason = !limiter.take(key, t) ? 'rate' : dropReason({
      hostname: p.hostname,
      origin: req.headers.origin ?? null,
      userAgent: ua || null,
      webdriver: p.webdriver,
      screen: p.screen,
      referrer: p.referrer,
      asnClass: req.headers['x-asn-class'] === 'datacenter' ? 'datacenter' : 'unknown',
    }, site.domains)

    if (reason) {
      await spool.push({ kind: 'drop', site: p.site, day, reason })
      stats.dropped++
      return reason === 'rate' ? 429 : 403
    }
    let referrer: string | null = null
    try { referrer = p.referrer ? new URL(p.referrer).hostname.replace(/^www\./, '') : null } catch { referrer = null }
    await spool.push({
      kind: 'event', site: p.site, tenant: site.tenantId, ts: new Date(t).toISOString(),
      data: {
        type: p.type, name: p.name ?? null, path: p.path, referrer,
        utm_source: p.utm?.source ?? null, utm_medium: p.utm?.medium ?? null, utm_campaign: p.utm?.campaign ?? null,
        country: country(req), ...parseUa(ua), visitor: visitorId(await salt.current(t), p.site, ip, ua), props: p.props ?? null,
      },
    })
    stats.accepted++
    return 202
  }

  async function tracker(res: ServerResponse, version: string) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) return end(res, 404)
    try {
      const js = await readFile(new URL(`${version}/a.js`, TRACKER_DIR))
      res.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
        'cross-origin-resource-policy': 'cross-origin',
      })
      res.end(js)
    } catch {
      end(res, 404)
    }
  }

  const end = (res: ServerResponse, code: number, extra: Record<string, string> = {}) => {
    res.writeHead(code, { ...extra })
    res.end()
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://collector')
    if (url.pathname === '/e') {
      if (req.method === 'OPTIONS') return end(res, 204, CORS)
      if (req.method !== 'POST') return end(res, 405, CORS)
      try { return end(res, await ingest(req), CORS) } catch (error) {
        const oversized = (error as { status?: number }).status === 413
        if (!oversized) console.error('collection storage failed')
        return end(res, oversized ? 413 : 503, { ...CORS, 'cache-control': 'no-store', ...(oversized ? {} : { 'retry-after': '60' }) })
      }
    }
    const t = url.pathname.match(/^\/t\/([^/]+)\/a\.js$/)
    if (t && req.method === 'GET') return tracker(res, t[1])
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ ok: true, ...stats }))
    }
    end(res, 404)
  }

  return { handle, stats }
}
