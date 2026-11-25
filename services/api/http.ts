import type { IncomingMessage, ServerResponse } from 'node:http'
import { connect, type Sql } from '../shared/db.ts'
import { normalizePath } from '../../packages/core/normalize.ts'
import { BOUNDS_MS } from '../../packages/core/histogram.ts'

// Shared plumbing for the serverless API. Stellarcope measures its own API with its own API
// analytics: every handler wrapped in `measured` writes one histogram sample per request.

let pool: Promise<Sql> | null = null
export const db = () => (pool ??= connect())

export const SELF_TENANT = 'stellarcope'

export function json(res: ServerResponse, status: number, body: unknown, cache = 'no-store') {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', cache)
  res.end(JSON.stringify(body))
}

export function query(req: IncomingMessage) {
  return new URL(req.url ?? '/', 'http://api').searchParams
}

export const days = (q: URLSearchParams) => {
  const n = Number(q.get('days') ?? 30)
  return [1, 7, 30, 90].includes(n) ? n : 30
}

export const isDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

async function record(route: string, status: number, ms: number) {
  const sql = await db()
  const buckets = new Array(BOUNDS_MS.length + 1).fill(0)
  const i = BOUNDS_MS.findIndex((b) => ms <= b)
  buckets[i < 0 ? BOUNDS_MS.length : i] = 1
  const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000)
  await sql.query(
    `insert into api_minute (tenant_id, service, route, status_class, minute, count, sum_ms, buckets)
     values ($1, 'stellarcope-api', $2, $3, $4, 1, $5, $6)
     on conflict (tenant_id, service, route, status_class, minute) do update set
       count = api_minute.count + 1,
       sum_ms = api_minute.sum_ms + excluded.sum_ms,
       buckets = (select array_agg(a + b order by n) from unnest(api_minute.buckets, excluded.buckets) with ordinality t(a, b, n))`,
    [SELF_TENANT, route, `${Math.floor(status / 100)}xx`, minute, ms, buckets],
  )
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void

export function measured(handler: Handler): Handler {
  return async (req, res) => {
    const start = performance.now()
    try {
      await handler(req, res)
    } catch (err) {
      console.error('handler failed')
      if (!res.headersSent) json(res, 500, { error: 'internal error' })
    }
    const route = `${req.method} ${normalizePath(new URL(req.url ?? '/', 'http://api').pathname).route}`
    const done = record(route, res.statusCode, performance.now() - start).catch(() => console.error('metric write failed'))
    try {
      const { waitUntil } = await import('@vercel/functions')
      waitUntil(done)
    } catch {
      await done
    }
  }
}
