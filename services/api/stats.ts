import type { Sql } from '../shared/db.ts'
import { BOUNDS_MS, quantile, type Histogram } from '../../packages/core/histogram.ts'

// Read side for dashboards. Every figure is computed from stored rows at request time.

export type Point = { date: string; value: number }
export type Share = { label: string; value: number; share: number }

const DAY = 86_400_000
const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10)

export function range(days: number, now = Date.now()) {
  const end = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) + DAY
  return { from: new Date(end - days * DAY), to: new Date(end) }
}

/** zero-filled daily series so charts never skip a day */
function fill(rows: { d: Date | string; v: number | string }[], days: number, now = Date.now()) {
  const { from } = range(days, now)
  const map = new Map(rows.map((r) => [dayKey(r.d), Number(r.v)]))
  return Array.from({ length: days }, (_, i) => {
    const date = dayKey(new Date(from.getTime() + i * DAY))
    return { date, value: map.get(date) ?? 0 }
  })
}

const shares = (rows: { label: string | null; v: number | string }[], fallback = 'Unknown', denominator?: number): Share[] => {
  const total = (denominator ?? rows.reduce((a, r) => a + Number(r.v), 0)) || 1
  return rows.map((r) => ({ label: r.label ?? fallback, value: Number(r.v), share: Number(r.v) / total }))
}

export async function sitesOf(sql: Sql, tenant: string) {
  const { rows } = await sql.query<{ id: string }>('select id from sites where tenant_id = $1', [tenant])
  return rows.map((r) => r.id)
}

export async function webStats(sql: Sql, sites: string[], days: number) {
  const { from, to } = range(days)
  const prevFrom = new Date(from.getTime() - days * DAY)
  const p = [sites, from, to]
  const top = (col: string, extra = '') => sql.query<{ label: string | null; v: number }>(
    `select ${col} as label, count(*)::int v from events where site_id = any($1) and ts >= $2 and ts < $3 and type = 'pageview' ${extra} group by 1 order by 2 desc limit 8`, p)

  const [daily, sessions, prev, pages, refs, countries, devices, browsers, events, heat] = await Promise.all([
    sql.query<{ d: Date; v: number; pv: number }>(
      `select date_trunc('day', ts) d, count(distinct visitor)::int v, count(*) filter (where type = 'pageview')::int pv
         from events where site_id = any($1) and ts >= $2 and ts < $3 group by 1`, p),
    sql.query<{ visits: number; bounces: number; avg_s: number }>(
      `select count(*)::int visits, count(*) filter (where pv = 1)::int bounces, coalesce(avg(secs), 0)::float avg_s from (
         select visitor, date_trunc('day', ts) d, count(*) filter (where type = 'pageview') pv, extract(epoch from max(ts) - min(ts)) secs
           from events where site_id = any($1) and ts >= $2 and ts < $3 group by 1, 2) s`, p),
    sql.query<{ v: number }>(
      `select coalesce(sum(v), 0)::int v from (select count(distinct visitor) v from events where site_id = any($1) and ts >= $2 and ts < $3 group by date_trunc('day', ts)) x`,
      [sites, prevFrom, from]),
    top('path'),
    top(`coalesce(referrer, 'Direct')`),
    top('country'),
    top('device'),
    top('browser'),
    sql.query<{ label: string; v: number }>(
      `select name as label, count(*)::int v from events where site_id = any($1) and ts >= $2 and ts < $3 and type = 'event'
         and name not like 'wallet\\_%' and name not like 'tx\\_%' group by 1 order by 2 desc limit 8`, p),
    sql.query<{ d: number; h: number; v: number }>(
      `select extract(isodow from ts)::int d, extract(hour from ts)::int h, count(*)::int v
         from events where site_id = any($1) and ts >= $2 and ts < $3 and type = 'pageview' group by 1, 2`, p),
  ])
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[])
  for (const r of heat.rows) heatmap[r.d - 1][r.h] = r.v

  const visitors = fill(daily.rows.map((r) => ({ d: r.d, v: r.v })), days)
  const pageviews = fill(daily.rows.map((r) => ({ d: r.d, v: r.pv })), days)
  const total = visitors.reduce((a, b) => a + b.value, 0)
  const totalPageviews = pageviews.reduce((a, b) => a + b.value, 0)
  const s = sessions.rows[0]
  return {
    visitors,
    pageviewSeries: pageviews,
    total,
    pageviews: totalPageviews,
    delta: prev.rows[0].v ? total / prev.rows[0].v - 1 : null,
    bounce: s.visits ? s.bounces / s.visits : null,
    session: Math.round(s.avg_s),
    pages: shares(pages.rows, 'Unknown', totalPageviews),
    referrers: shares(refs.rows, 'Unknown', totalPageviews),
    countries: shares(countries.rows, 'Unknown', totalPageviews),
    devices: shares(devices.rows),
    browsers: shares(browsers.rows),
    events: shares(events.rows),
    heatmap,
  }
}

export async function walletStats(sql: Sql, sites: string[], days: number) {
  const { from, to } = range(days)
  const [funnel, share] = await Promise.all([
    sql.query<{ name: string; v: number }>(
      `select name, count(*)::int v from events where site_id = any($1) and ts >= $2 and ts < $3
         and name in ('wallet_modal_open', 'wallet_connected', 'tx_sign_requested', 'tx_signed') group by 1`, [sites, from, to]),
    sql.query<{ label: string; v: number }>(
      `select props->>'wallet_id' as label, count(*)::int v from events where site_id = any($1) and ts >= $2 and ts < $3
         and name = 'wallet_connected' group by 1 order by 2 desc limit 8`, [sites, from, to]),
  ])
  const by = new Map(funnel.rows.map((r) => [r.name, r.v]))
  return {
    funnel: ['wallet_modal_open', 'wallet_connected', 'tx_sign_requested', 'tx_signed'].map((label) => ({ label, value: by.get(label) ?? 0 })),
    share: shares(share.rows),
  }
}

const hist = (rows: { i: number; v: number | string }[]): Histogram => {
  const counts = new Array(BOUNDS_MS.length + 1).fill(0)
  for (const r of rows) counts[r.i - 1] = Number(r.v)
  return { counts, sum: 0, count: counts.reduce((a, b) => a + b, 0) }
}

export async function apiStats(sql: Sql, tenant: string, days: number) {
  const { from, to } = range(days)
  const p = [tenant, from, to]
  const [daily, status, routes, buckets, routeBuckets, dailyBuckets] = await Promise.all([
    sql.query<{ d: Date; v: number }>(`select date_trunc('day', minute) d, sum(count)::int v from api_minute where tenant_id = $1 and minute >= $2 and minute < $3 group by 1`, p),
    sql.query<{ label: string; v: number }>(`select status_class as label, sum(count)::int v from api_minute where tenant_id = $1 and minute >= $2 and minute < $3 group by 1 order by 1`, p),
    sql.query<{ route: string; v: number; errors: number }>(
      `select route, sum(count)::int v, sum(count) filter (where status_class = '5xx')::int errors from api_minute where tenant_id = $1 and minute >= $2 and minute < $3 group by 1 order by 2 desc limit 10`, p),
    sql.query<{ i: number; v: number }>(`select u.i::int i, sum(u.b)::bigint v from api_minute, unnest(buckets) with ordinality u(b, i) where tenant_id = $1 and minute >= $2 and minute < $3 group by 1`, p),
    sql.query<{ route: string; i: number; v: number }>(`select route, u.i::int i, sum(u.b)::bigint v from api_minute, unnest(buckets) with ordinality u(b, i) where tenant_id = $1 and minute >= $2 and minute < $3 group by 1, 2`, p),
    sql.query<{ d: Date; i: number; v: number }>(`select date_trunc('day', minute) d, u.i::int i, sum(u.b)::bigint v from api_minute, unnest(buckets) with ordinality u(b, i) where tenant_id = $1 and minute >= $2 and minute < $3 group by 1, 2`, p),
  ])
  const all = hist(buckets.rows)
  const requests = fill(daily.rows, days)
  const total = requests.reduce((a, b) => a + b.value, 0)
  const errors = status.rows.find((r) => r.label === '5xx')?.v ?? 0

  const perDay = new Map<string, { i: number; v: number }[]>()
  for (const r of dailyBuckets.rows) {
    const k = dayKey(r.d)
    perDay.set(k, [...(perDay.get(k) ?? []), { i: r.i, v: Number(r.v) }])
  }
  const perRoute = new Map<string, { i: number; v: number }[]>()
  for (const r of routeBuckets.rows) perRoute.set(r.route, [...(perRoute.get(r.route) ?? []), { i: r.i, v: Number(r.v) }])

  return {
    requests,
    latency: requests.map((d) => ({ date: d.date, value: quantile(hist(perDay.get(d.date) ?? []), 0.95) ?? 0 })),
    total,
    errorRate: total ? errors / total : null,
    p50: quantile(all, 0.5),
    p95: quantile(all, 0.95),
    status: shares(status.rows),
    routes: routes.rows.map((r) => {
      const h = hist(perRoute.get(r.route) ?? [])
      return { label: r.route, value: r.v, share: total ? r.v / total : 0, errors: r.errors ?? 0, p50: quantile(h, 0.5), p95: quantile(h, 0.95) }
    }),
  }
}

export async function trust(sql: Sql, tenant: string, sites: string[], days: number) {
  const { from, to } = range(days)
  const [domains, sealed, drops, kept] = await Promise.all([
    sql.query<{ domain: string; method: string | null; verified_at: Date | null }>('select domain, method, verified_at from domains where tenant_id = $1 order by domain', [tenant]),
    sql.query<{ n: number }>(`select count(*)::int n from seal_leaves where tenant_id = $1 and day >= current_date - 2`, [tenant]),
    sql.query<{ label: string; v: number }>(`select reason as label, sum(count)::int v from drops where site_id = any($1) and day >= $2 and day < $3 group by 1 order by 2 desc`, [sites, from, to]),
    sql.query<{ v: number }>(`select count(*)::int v from events where site_id = any($1) and ts >= $2 and ts < $3`, [sites, from, to]),
  ])
  const dropped = drops.rows.reduce((a, r) => a + r.v, 0)
  const filtered = dropped + kept.rows[0].v ? dropped / (dropped + kept.rows[0].v) : 0
  const verified = domains.rows.filter((d) => d.verified_at)
  const checks = {
    sep1: verified.some((d) => d.method === 'sep1'),
    dns: verified.some((d) => d.method === 'dns'),
    meta: verified.some((d) => d.method === 'meta'),
    origin: verified.length > 0,
    sealed: sealed.rows[0].n > 0,
  }
  // the trust formula, versioned: trust-v2. Filtered traffic is a mild signal: crawlers hitting a
  // site are not the project's fault, but a site that is mostly filtered deserves a closer look.
  const score = Math.round(Math.max(0, Math.min(100,
    40 + (checks.sep1 ? 12 : 0) + (checks.dns || checks.meta ? 10 : 0) + (checks.origin ? 15 : 0) + (checks.sealed ? 13 : 0) + 10 - filtered * 30,
  )))
  return {
    score,
    formula: 'trust-v2',
    checks,
    domains: domains.rows.map((d) => ({ domain: d.domain, method: d.method, verified: !!d.verified_at })),
    filtered,
    drops: shares(drops.rows),
  }
}

/** most recent events, for the live feed; no visitor ids leave the server */
export async function live(sql: Sql, sites: string[]) {
  const [recent, active] = await Promise.all([
    sql.query<{ ts: Date; type: string; name: string | null; path: string; country: string | null; device: string; browser: string }>(
      `select ts, type, name, path, country, device, browser from events where site_id = any($1) order by ts desc limit 30`, [sites]),
    sql.query<{ v: number }>(`select count(distinct visitor)::int v from events where site_id = any($1) and ts > now() - interval '5 minutes'`, [sites]),
  ])
  return { active: active.rows[0].v, events: recent.rows.map((r) => ({ ...r, ts: new Date(r.ts).toISOString() })) }
}
